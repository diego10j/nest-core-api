import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { getCurrentTime, getCurrentDateTime } from 'src/util/helpers/date-util';

import { PreLibroBancosSaveService } from '../pre-libro-bancos/pre-libro-bancos-save.service';
import { PreLibroBancosService } from '../pre-libro-bancos/pre-libro-bancos.service';

import { LiquidarAnticipoProveedorDto } from './dto/liquidar-anticipo-proveedor.dto';
import { RegistrarAnticipoProveedorDto } from './dto/registrar-anticipo-proveedor.dto';

const IDE_TETTB_CHEQUE_POSFECHADO = 14;

/** Tolerancia de redondeo (centavos) al comparar valores para decidir si un anticipo/aplicación
 * quedó completa. */
const TOLERANCIA_CENTAVOS = 0.01;

/**
 * Guardado de Anticipo a Proveedores: registra el pago en cxp_cabece_transa/cxp_detall_transa
 * (mismo mecanismo genérico que CxpTransaccionesSaveService.savePagoCxP/saveAnticipoCxP - así
 * aparece de una en Transacciones CxP y en el detalle de Tesorería), pero con su propio asiento
 * contable contra la cuenta dedicada "ANTICIPO A PROVEEDORES" en vez de la cuenta por pagar del
 * proveedor (ver AsientosAutomaticosService.generarAsientoAnticipoProveedor).
 *
 * Liquidarlo contra UNA sola factura por el saldo completo no necesita nada especial: ya
 * funciona pasando ide_cpctr_anticipo a DocumentosCxPSaveService.saveDocumento
 * (resolverCabeceraTransaccion reutiliza esa cabecera). Este servicio solo cubre lo que ese
 * mecanismo no soporta - varias facturas o aplicación parcial - registrado en
 * cxp_aplicacion_anticipo (una fila por factura, con su propio asiento de reclasificación).
 */
@Injectable()
export class AnticipoProveedorSaveService extends BaseService {
    private readonly logger = new Logger(AnticipoProveedorSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly preLibroBancosService: PreLibroBancosService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
    ) {
        super();
        this.core
            .getVariables(['p_tes_estado_lib_banco_normal', 'p_cxp_tipo_trans_anticipo'])
            .then((result) => {
                this.variables = result;
            });
    }

    async registrar(dtoIn: RegistrarAnticipoProveedorDto & HeaderParamsDto) {
        if (dtoIn.valor <= 0) {
            throw new BadRequestException('El valor del anticipo debe ser mayor a 0');
        }

        const esChequePostfechado = dtoIn.ideTettb === IDE_TETTB_CHEQUE_POSFECHADO;
        if (esChequePostfechado) {
            if (!dtoIn.fechaEfectivo) {
                throw new BadRequestException('Cheque posfechado requiere fechaEfectivo');
            }
            if (!dtoIn.numCuentaCheque) {
                throw new BadRequestException('Cheque posfechado requiere numCuentaCheque');
            }
        }

        // A diferencia de saveAnticipoCxP (que cae a un '000000' fijo), acá se genera un
        // secuencial real cuando no viene número - '000000' colisiona en el segundo anticipo
        // que se registre con la misma cuenta/tipo de transacción (mismo patrón que
        // CxpTransaccionesSaveService.savePagoCxP).
        const numero = dtoIn.numero
            ?? await this.preLibroBancosSaveService.generarNumeroAutomatico(dtoIn.ideTecba, dtoIn.ideTettb, dtoIn);
        const { existe } = await this.preLibroBancosService.existeNumTransaccion({
            ...dtoIn,
            ideTecba: dtoIn.ideTecba,
            ideTettb: dtoIn.ideTettb,
            numero,
        });
        if (existe) {
            throw new BadRequestException(
                `El número de documento ${numero} ya existe para esta cuenta y tipo de transacción`,
            );
        }

        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const ideCpttrAnticipo = Number(this.variables.get('p_cxp_tipo_trans_anticipo'));
        const fechaVenceCuota = esChequePostfechado ? (dtoIn.fechaEfectivo ?? dtoIn.fecha) : dtoIn.fecha;

        // tes_cab_libr_banc no tiene columna ide_geper - el proveedor se identifica en el
        // listado de movimientos únicamente por beneficiari_teclb (texto libre), igual que
        // CxpTransaccionesSaveService.savePagoCxP.
        const qPersona = new SelectQuery(`SELECT nom_geper FROM gen_persona WHERE ide_geper = $1 LIMIT 1`);
        qPersona.addIntParam(1, dtoIn.ideGeper);
        const persona = await this.dataSource.createSingleQuery(qPersona);
        const beneficiario = persona?.nom_geper ?? '';

        const ideTeclb = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
        const ideCpctr = await this.dataSource.getSeqTable('cxp_cabece_transa', 'ide_cpctr', 1, dtoIn.login);
        const ideCpdtr = await this.dataSource.getSeqTable('cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login);

        // Asiento contable ANTES de tocar tesorería (todo o nada): si no se puede contabilizar
        // (ej. cuenta "ANTICIPO A PROVEEDORES" sin configurar), no se guarda nada.
        const asientoResult = await this.asientosAutomaticosService.generarAsientoAnticipoProveedor({
            ideTeclb, fecha: dtoIn.fecha, ideTecba: dtoIn.ideTecba, ideTettb: dtoIn.ideTettb,
            ideGeper: dtoIn.ideGeper, valor: dtoIn.valor, observacion: dtoIn.observacion,
            ...dtoIn,
        });
        if (!asientoResult.generado) {
            throw new BadRequestException(
                `No se pudo generar el asiento contable del anticipo (${(asientoResult.advertencias ?? []).join('; ') || 'error desconocido'}). El anticipo no fue registrado.`,
            );
        }
        const ideCnccc = asientoResult.ide_cnccc ?? null;

        const queryRunner = await this.dataSource.pool.connect();
        try {
            await queryRunner.query('BEGIN');

            await queryRunner.query(
                `INSERT INTO tes_cab_libr_banc (
                    ide_teclb, ide_teelb, ide_tecba, ide_tettb, valor_teclb,
                    numero_teclb, fecha_trans_teclb, fecha_venci_teclb, beneficiari_teclb,
                    observacion_teclb, conciliado_teclb, fec_cam_est_teclb, num_comprobante_teclb,
                    ide_teban, depositado_teclb, devuelto_teclb,
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre, ide_cnccc
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
                [ideTeclb, ideTeelb, dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.valor,
                    numero, dtoIn.fecha, fechaVenceCuota, beneficiario,
                    dtoIn.observacion, false, dtoIn.fechaEfectivo ?? dtoIn.fecha, dtoIn.numCuentaCheque ?? '',
                    dtoIn.ideTeban ?? null, false, false,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime(), ideCnccc],
            );

            // Misma pareja cxp_cabece_transa/cxp_detall_transa que saveAnticipoCxP (paridad
            // "generarTransaccionAnticipo" del legacy) - ide_cpcfa queda NULL hasta que se
            // aplique a una factura (ver ide_cpctr_anticipo en saveDocumento, o liquidar() acá
            // abajo para el caso de varias facturas).
            await queryRunner.query(
                `INSERT INTO cxp_cabece_transa (
                    ide_cpctr, ide_geper, ide_cpttr, fecha_trans_cpctr, observacion_cpctr,
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [ideCpctr, dtoIn.ideGeper, ideCpttrAnticipo, dtoIn.fecha, dtoIn.observacion,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
            );

            await queryRunner.query(
                `INSERT INTO cxp_detall_transa (
                    ide_cpdtr, ide_teclb, ide_cpctr, ide_cpttr, ide_usua,
                    valor_cpdtr, observacion_cpdtr, numero_pago_cpdtr,
                    fecha_trans_cpdtr, fecha_venci_cpdtr, docum_relac_cpdtr, valor_anticipo_cpdtr,
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre, ide_cnccc
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
                [ideCpdtr, ideTeclb, ideCpctr, ideCpttrAnticipo, dtoIn.ideUsua,
                    dtoIn.valor, dtoIn.observacion, 0,
                    dtoIn.fecha, fechaVenceCuota, numero, 0,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime(), ideCnccc],
            );

            if (dtoIn.ideCpcfc != null) {
                // Mismo proveedor por seguridad - así el detalle del grupo puede mostrar/ocultar
                // "Registrar Anticipo" sabiendo que ya tiene uno vinculado.
                const { rowCount } = await queryRunner.query(
                    `UPDATE cxp_cab_flete_cons SET ide_cpctr_anticipo = $1 WHERE ide_cpcfc = $2 AND ide_geper = $3`,
                    [ideCpctr, dtoIn.ideCpcfc, dtoIn.ideGeper],
                );
                if (rowCount === 0) {
                    throw new BadRequestException(
                        `El grupo ide_cpcfc=${dtoIn.ideCpcfc} no existe o no pertenece a este proveedor.`,
                    );
                }
            }

            await queryRunner.query('COMMIT');
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            if (ideCnccc != null) await this.asientosAutomaticosService.eliminarAsiento(ideCnccc, dtoIn);
            throw error;
        } finally {
            queryRunner.release();
        }

        await this.preLibroBancosSaveService.actualizarSecuencial(dtoIn.ideTecba, dtoIn.ideTettb, numero, dtoIn);

        return {
            message: 'ok',
            ide_cpctr: ideCpctr,
            ide_teclb: ideTeclb,
            ide_geper: dtoIn.ideGeper,
            valor: dtoIn.valor,
            asiento_contable: asientoResult,
        };
    }

    /**
     * Aplica (liquida) un anticipo contra una o varias facturas del proveedor. Si es una sola
     * factura por el saldo completo, resuelve directo con cxp_cabece_transa.ide_cpcfa (mismo
     * resultado que si se hubiera creado la factura con ide_cpctr_anticipo desde el inicio) sin
     * generar ningún asiento extra - el reclasificador de saldo ya lo hace saveDocumento en ese
     * flujo, acá el valor a aplicar YA es exactamente el saldo del anticipo, así que solo hace
     * falta el vínculo. Para varias facturas o montos parciales, cada una queda registrada en
     * cxp_aplicacion_anticipo con su propio asiento de reclasificación.
     */
    async liquidar(dtoIn: LiquidarAnticipoProveedorDto & HeaderParamsDto) {
        if (!dtoIn.aplicaciones?.length) {
            throw new BadRequestException('Debe indicar al menos una factura a la que aplicar el anticipo.');
        }

        const qCab = new SelectQuery(`
            SELECT ct.ide_geper, ct.ide_cpcfa, cd.valor_cpdtr AS valor_teanp,
                   COALESCE((SELECT SUM(valor_aplicado_cpaan) FROM cxp_aplicacion_anticipo
                             WHERE ide_cpctr = ct.ide_cpctr AND activo_cpaan = true), 0) AS aplicado
            FROM cxp_cabece_transa ct
            INNER JOIN cxp_detall_transa cd ON cd.ide_cpctr = ct.ide_cpctr
            WHERE ct.ide_cpctr = $1 AND ct.ide_empr = $2 AND ct.ide_sucu = $3
        `);
        qCab.addIntParam(1, dtoIn.ide_cpctr);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cab = await this.dataSource.createSingleQuery(qCab);
        if (!cab) {
            throw new BadRequestException(`Anticipo ide_cpctr=${dtoIn.ide_cpctr} no encontrado.`);
        }
        if (cab.ide_cpcfa != null) {
            throw new BadRequestException('Este anticipo ya está completamente liquidado contra una factura.');
        }

        const saldoDisponible = Number(cab.valor_teanp) - Number(cab.aplicado);
        const totalAplicar = dtoIn.aplicaciones.reduce((sum, a) => sum + Number(a.valor), 0);
        if (totalAplicar - saldoDisponible > TOLERANCIA_CENTAVOS) {
            throw new BadRequestException(
                `El total a aplicar (${totalAplicar.toFixed(2)}) supera el saldo disponible del anticipo (${saldoDisponible.toFixed(2)}).`,
            );
        }

        const ideCpcfaList = dtoIn.aplicaciones.map((a) => a.ide_cpcfa);
        // pagado_cpcfa no siempre queda actualizado por otros flujos - se valida con el saldo
        // real de la transacción CxP del documento (SUM(valor*signo) = 0 -> ya está cubierto).
        const qFacturas = new SelectQuery(`
            SELECT cf.ide_cpcfa, cf.ide_geper,
                   COALESCE((
                       SELECT SUM(dt.valor_cpdtr * tt.signo_cpttr)
                       FROM cxp_detall_transa dt
                       JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
                       WHERE dt.ide_cpctr = ct.ide_cpctr
                   ), cf.total_cpcfa) AS saldo
            FROM cxp_cabece_factur cf
            LEFT JOIN cxp_cabece_transa ct ON ct.ide_cpcfa = cf.ide_cpcfa
            WHERE cf.ide_cpcfa = ANY($1) AND cf.ide_empr = $2 AND cf.ide_sucu = $3
        `);
        qFacturas.addParam(1, ideCpcfaList);
        qFacturas.addIntParam(2, dtoIn.ideEmpr);
        qFacturas.addIntParam(3, dtoIn.ideSucu);
        const facturas: { ide_cpcfa: number; ide_geper: number; saldo: number }[] =
            await this.dataSource.createSelectQuery(qFacturas);
        if (facturas.length !== ideCpcfaList.length) {
            const faltantes = ideCpcfaList.filter((id) => !facturas.some((f) => f.ide_cpcfa === id));
            throw new BadRequestException(`Las siguientes facturas no existen: ${faltantes.join(', ')}`);
        }
        const facturaAjena = facturas.find((f) => Number(f.ide_geper) !== Number(cab.ide_geper));
        if (facturaAjena) {
            throw new BadRequestException(
                `La factura ide_cpcfa=${facturaAjena.ide_cpcfa} no pertenece al proveedor de este anticipo.`,
            );
        }
        const facturaPagada = facturas.find((f) => Math.abs(Number(f.saldo)) <= TOLERANCIA_CENTAVOS);
        if (facturaPagada) {
            throw new BadRequestException(`La factura ide_cpcfa=${facturaPagada.ide_cpcfa} ya está pagada.`);
        }

        // Si es una sola factura y cubre el saldo completo, no hace falta registrar nada en
        // cxp_aplicacion_anticipo: alcanza con mover el detalle del anticipo a la cabecera que
        // esa factura ya tiene (creada al registrarla normalmente) y borrar la cabecera del
        // anticipo, que queda con 0 detalles - dejar las dos cabeceras por separado, ambas
        // apuntando al mismo ide_cpcfa, rompería getFacturaCxP/getFacturasPendientesProveedor
        // (asumen una sola cxp_cabece_transa por documento). Mismo criterio que
        // FleteConsolidadoSaveService.asociarAnticipoExistente.
        const esLiquidacionTotalSimple =
            dtoIn.aplicaciones.length === 1 &&
            Math.abs(totalAplicar - saldoDisponible) <= TOLERANCIA_CENTAVOS;

        if (esLiquidacionTotalSimple) {
            const ideCpcfa = dtoIn.aplicaciones[0].ide_cpcfa;
            const qFacturaCab = new SelectQuery(`SELECT ide_cpctr FROM cxp_cabece_transa WHERE ide_cpcfa = $1`);
            qFacturaCab.addIntParam(1, ideCpcfa);
            const facturaCab = await this.dataSource.createSingleQuery(qFacturaCab);
            if (!facturaCab) {
                throw new InternalServerErrorException(
                    `La factura ide_cpcfa=${ideCpcfa} no tiene una transacción CxP asociada.`,
                );
            }
            const ideCpctrFactura = Number(facturaCab.ide_cpctr);

            const queryRunner = await this.dataSource.pool.connect();
            try {
                await queryRunner.query('BEGIN');
                await queryRunner.query(
                    `UPDATE cxp_detall_transa SET ide_cpctr = $1, ide_cpcfa = $2 WHERE ide_cpctr = $3`,
                    [ideCpctrFactura, ideCpcfa, dtoIn.ide_cpctr],
                );
                await queryRunner.query(`DELETE FROM cxp_cabece_transa WHERE ide_cpctr = $1`, [dtoIn.ide_cpctr]);
                await queryRunner.query('COMMIT');
            } catch (error) {
                await queryRunner.query('ROLLBACK');
                throw error;
            } finally {
                queryRunner.release();
            }

            // pagado_cpcfa no siempre queda actualizado por otros flujos - se valida con el
            // saldo real resultante, no con "se aplicó todo el anticipo disponible" (el
            // anticipo puede ser menor al total de la factura y dejarla con saldo pendiente
            // real, pagable por el resto vía Registrar Pago).
            const qSaldoFactura = new SelectQuery(`
                SELECT COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0) AS saldo
                FROM cxp_detall_transa dt
                JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
                WHERE dt.ide_cpctr = $1
            `);
            qSaldoFactura.addIntParam(1, ideCpctrFactura);
            const { saldo: saldoFactura } = await this.dataSource.createSingleQuery(qSaldoFactura);
            if (Math.abs(Number(saldoFactura)) <= TOLERANCIA_CENTAVOS) {
                await this.dataSource.pool.query(
                    `UPDATE cxp_cabece_factur SET pagado_cpcfa = true WHERE ide_cpcfa = $1`,
                    [ideCpcfa],
                );
            }
            return { message: 'ok', ide_cpctr: ideCpctrFactura, saldo_restante: Number(saldoFactura) };
        }

        const baseIdeCpaan = await this.dataSource.getSeqTable(
            'cxp_aplicacion_anticipo', 'ide_cpaan', dtoIn.aplicaciones.length, dtoIn.login,
        );

        const detalles: { ide_cpaan: number; ide_cpcfa: number; valor: number; ide_cnccc: number | null }[] = [];
        for (let i = 0; i < dtoIn.aplicaciones.length; i += 1) {
            const aplicacion = dtoIn.aplicaciones[i];
            const asiento = await this.asientosAutomaticosService.generarAsientoLiquidacionAnticipo({
                ideGeper: Number(cab.ide_geper),
                fecha: this.hoy(),
                valor: aplicacion.valor,
                observacion: `Liquidación anticipo #${dtoIn.ide_cpctr} - factura ${aplicacion.ide_cpcfa}`,
                ...dtoIn,
            });
            if (!asiento.generado) {
                await Promise.all(
                    detalles.filter((d) => d.ide_cnccc != null)
                        .map((d) => this.asientosAutomaticosService.eliminarAsiento(d.ide_cnccc as number, dtoIn)),
                );
                throw new BadRequestException(
                    `No se pudo generar el asiento de liquidación para la factura ${aplicacion.ide_cpcfa} (${(asiento.advertencias ?? []).join('; ') || 'error desconocido'}).`,
                );
            }
            detalles.push({
                ide_cpaan: baseIdeCpaan + i,
                ide_cpcfa: aplicacion.ide_cpcfa,
                valor: aplicacion.valor,
                ide_cnccc: asiento.ide_cnccc ?? null,
            });
        }

        const queryRunner = await this.dataSource.pool.connect();
        try {
            await queryRunner.query('BEGIN');
            for (const det of detalles) {
                await queryRunner.query(
                    `INSERT INTO cxp_aplicacion_anticipo (
                        ide_cpaan, ide_cpctr, ide_cpcfa, valor_aplicado_cpaan, ide_cnccc,
                        fecha_cpaan, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [det.ide_cpaan, dtoIn.ide_cpctr, det.ide_cpcfa, det.valor, det.ide_cnccc,
                        this.hoy(), dtoIn.login, getCurrentDateTime()],
                );
            }
            await queryRunner.query('COMMIT');
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            await Promise.all(
                detalles.filter((d) => d.ide_cnccc != null)
                    .map((d) => this.asientosAutomaticosService.eliminarAsiento(d.ide_cnccc as number, dtoIn)),
            );
            throw new InternalServerErrorException(
                `No se pudo registrar la liquidación del anticipo: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            queryRunner.release();
        }

        return {
            message: 'ok',
            ide_cpctr: dtoIn.ide_cpctr,
            saldo_restante: Number((saldoDisponible - totalAplicar).toFixed(2)),
        };
    }

    /** Anula un anticipo que todavía no tiene ninguna liquidación (ni directa por ide_cpcfa ni
     * en cxp_aplicacion_anticipo): reversa el movimiento de tesorería y su asiento (mismo
     * mecanismo genérico que cualquier pago), y borra las filas de
     * cxp_cabece_transa/cxp_detall_transa (anularMovimiento no las toca solo porque
     * numero_pago_cpdtr = 0, a diferencia de un pago aplicado a un documento). */
    async anular(ideCpctr: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT ct.ide_cpcfa,
                   cd.ide_teclb,
                   COALESCE((SELECT COUNT(*) FROM cxp_aplicacion_anticipo
                             WHERE ide_cpctr = ct.ide_cpctr AND activo_cpaan = true), 0) AS num_aplicaciones
            FROM cxp_cabece_transa ct
            INNER JOIN cxp_detall_transa cd ON cd.ide_cpctr = ct.ide_cpctr
            WHERE ct.ide_cpctr = $1
        `);
        qCab.addIntParam(1, ideCpctr);
        const cab = await this.dataSource.createSingleQuery(qCab);
        if (!cab) {
            throw new BadRequestException(`Anticipo ide_cpctr=${ideCpctr} no encontrado.`);
        }
        if (cab.ide_cpcfa != null || Number(cab.num_aplicaciones) > 0) {
            throw new BadRequestException(
                'Este anticipo ya tiene liquidaciones aplicadas - no se puede anular directamente.',
            );
        }

        await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: Number(cab.ide_teclb) });

        // Primero desvincular el FK (cxp_cab_flete_cons.ide_cpctr_anticipo) - si se borra
        // cxp_cabece_transa antes, la BD rechaza el delete por la foreign key.
        const queryRunner = await this.dataSource.pool.connect();
        try {
            await queryRunner.query('BEGIN');
            await queryRunner.query(
                `UPDATE cxp_cab_flete_cons SET ide_cpctr_anticipo = NULL WHERE ide_cpctr_anticipo = $1`,
                [ideCpctr],
            );
            await queryRunner.query(`DELETE FROM cxp_detall_transa WHERE ide_cpctr = $1`, [ideCpctr]);
            await queryRunner.query(`DELETE FROM cxp_cabece_transa WHERE ide_cpctr = $1`, [ideCpctr]);
            await queryRunner.query('COMMIT');
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            throw error;
        } finally {
            queryRunner.release();
        }

        return { message: 'ok', ide_cpctr: ideCpctr };
    }

    private hoy(): string {
        return new Date().toISOString().slice(0, 10);
    }
}
