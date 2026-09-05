import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { getCurrentTime } from 'src/util/helpers/date-util';

import { PreLibroBancosSaveService } from '../pre-libro-bancos/pre-libro-bancos-save.service';
import { PreLibroBancosService } from '../pre-libro-bancos/pre-libro-bancos.service';

import { LiquidarAnticipoProveedorDto } from './dto/liquidar-anticipo-proveedor.dto';
import { RegistrarAnticipoProveedorDto } from './dto/registrar-anticipo-proveedor.dto';

const IDE_TETTB_CHEQUE_POSFECHADO = 14;

/** Estados de tes_estado_anticipo_prov (seed en 1-anticipo-proveedores.sql). */
const ESTADO_PENDIENTE_LIQUIDAR = 1;
const ESTADO_PARCIALMENTE_LIQUIDADO = 2;
const ESTADO_LIQUIDADO = 3;
const ESTADO_ANULADO = 4;

/** Tolerancia de redondeo (centavos) al comparar el saldo liquidado contra el valor original,
 * para decidir si un anticipo quedó completamente liquidado. */
const TOLERANCIA_CENTAVOS = 0.01;

/**
 * Guardado de Anticipo a Proveedores: registra el pago (movimiento de tesorería + asiento contra
 * la cuenta dedicada de activo), lo liquida contra una o varias facturas cuando el proveedor
 * emite el comprobante (reclasifica Anticipo -> Cuenta por Pagar, un asiento por factura), o lo
 * anula si todavía no tiene ninguna liquidación. Mismo patrón operativo que
 * CxpTransaccionesSaveService.saveAnticipoCxP, pero con seguimiento de saldo propio
 * (tes_cab_anticipo_prov/tes_det_anticipo_prov) para soportar liquidación parcial y contra
 * varias facturas - el mecanismo genérico (cxp_cabece_transa) no lo permite.
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
            .getVariables(['p_tes_estado_lib_banco_normal'])
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
        const fechaVenceCuota = esChequePostfechado ? (dtoIn.fechaEfectivo ?? dtoIn.fecha) : dtoIn.fecha;

        const ideTeclb = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
        const ideTeanp = await this.dataSource.getSeqTable('tes_cab_anticipo_prov', 'ide_teanp', 1, dtoIn.login);

        // Asiento contable ANTES de tocar tesorería (mismo criterio "todo o nada" que
        // saveAnticipoCxP): si no se puede contabilizar, no se guarda nada.
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
                    numero, dtoIn.fecha, fechaVenceCuota, '',
                    dtoIn.observacion, false, dtoIn.fechaEfectivo ?? dtoIn.fecha, dtoIn.numCuentaCheque ?? '',
                    dtoIn.ideTeban ?? null, false, false,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime(), ideCnccc],
            );

            await queryRunner.query(
                `INSERT INTO tes_cab_anticipo_prov (
                    ide_teanp, ide_geper, ide_teclb, ide_cnccc, ide_teeap,
                    valor_teanp, valor_liquidado_teanp, fecha_teanp, observacion_teanp,
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [ideTeanp, dtoIn.ideGeper, ideTeclb, ideCnccc, ESTADO_PENDIENTE_LIQUIDAR,
                    dtoIn.valor, 0, dtoIn.fecha, dtoIn.observacion,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
            );

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
            ide_teanp: ideTeanp,
            ide_teclb: ideTeclb,
            ide_geper: dtoIn.ideGeper,
            valor: dtoIn.valor,
            asiento_contable: asientoResult,
        };
    }

    /**
     * Aplica (liquida) un anticipo contra una o varias facturas del proveedor: valida que el
     * saldo alcance y que cada factura pertenezca al mismo proveedor, genera un asiento de
     * reclasificación por cada aplicación, y actualiza el saldo/estado del anticipo.
     */
    async liquidar(dtoIn: LiquidarAnticipoProveedorDto & HeaderParamsDto) {
        if (!dtoIn.aplicaciones?.length) {
            throw new BadRequestException('Debe indicar al menos una factura a la que aplicar el anticipo.');
        }

        const qCab = new SelectQuery(`
            SELECT ide_geper, ide_teeap, valor_teanp, valor_liquidado_teanp
            FROM tes_cab_anticipo_prov
            WHERE ide_teanp = $1 AND ide_empr = $2 AND ide_sucu = $3
        `);
        qCab.addIntParam(1, dtoIn.ide_teanp);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cab = await this.dataSource.createSingleQuery(qCab);
        if (!cab) {
            throw new BadRequestException(`Anticipo a proveedor ide_teanp=${dtoIn.ide_teanp} no encontrado.`);
        }
        if (Number(cab.ide_teeap) === ESTADO_ANULADO) {
            throw new BadRequestException('Este anticipo está anulado.');
        }
        if (Number(cab.ide_teeap) === ESTADO_LIQUIDADO) {
            throw new BadRequestException('Este anticipo ya está completamente liquidado.');
        }

        const saldoDisponible = Number(cab.valor_teanp) - Number(cab.valor_liquidado_teanp);
        const totalAplicar = dtoIn.aplicaciones.reduce((sum, a) => sum + Number(a.valor), 0);
        if (totalAplicar - saldoDisponible > TOLERANCIA_CENTAVOS) {
            throw new BadRequestException(
                `El total a aplicar (${totalAplicar.toFixed(2)}) supera el saldo disponible del anticipo (${saldoDisponible.toFixed(2)}).`,
            );
        }

        const ideCpcfaList = dtoIn.aplicaciones.map((a) => a.ide_cpcfa);
        const qFacturas = new SelectQuery(`
            SELECT ide_cpcfa, ide_geper, total_cpcfa, pagado_cpcfa
            FROM cxp_cabece_factur
            WHERE ide_cpcfa = ANY($1) AND ide_empr = $2 AND ide_sucu = $3
        `);
        qFacturas.addParam(1, ideCpcfaList);
        qFacturas.addIntParam(2, dtoIn.ideEmpr);
        qFacturas.addIntParam(3, dtoIn.ideSucu);
        const facturas: { ide_cpcfa: number; ide_geper: number; total_cpcfa: number; pagado_cpcfa: boolean }[] =
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
        const facturaPagada = facturas.find((f) => f.pagado_cpcfa);
        if (facturaPagada) {
            throw new BadRequestException(`La factura ide_cpcfa=${facturaPagada.ide_cpcfa} ya está pagada.`);
        }

        const baseIdeTedap = await this.dataSource.getSeqTable(
            'tes_det_anticipo_prov', 'ide_tedap', dtoIn.aplicaciones.length, dtoIn.login,
        );

        const detalles: { ide_tedap: number; ide_cpcfa: number; valor: number; ide_cnccc: number | null }[] = [];
        for (let i = 0; i < dtoIn.aplicaciones.length; i += 1) {
            const aplicacion = dtoIn.aplicaciones[i];
            const asiento = await this.asientosAutomaticosService.generarAsientoLiquidacionAnticipo({
                ideGeper: Number(cab.ide_geper),
                fecha: this.hoy(),
                valor: aplicacion.valor,
                observacion: `Liquidación anticipo #${dtoIn.ide_teanp} - factura ${aplicacion.ide_cpcfa}`,
                ...dtoIn,
            });
            if (!asiento.generado) {
                // Revierte los asientos ya generados en este mismo lote antes de fallar, para no
                // dejar liquidaciones parciales contabilizadas sin sus filas de control.
                await Promise.all(
                    detalles.filter((d) => d.ide_cnccc != null)
                        .map((d) => this.asientosAutomaticosService.eliminarAsiento(d.ide_cnccc as number, dtoIn)),
                );
                throw new BadRequestException(
                    `No se pudo generar el asiento de liquidación para la factura ${aplicacion.ide_cpcfa} (${(asiento.advertencias ?? []).join('; ') || 'error desconocido'}).`,
                );
            }
            detalles.push({
                ide_tedap: baseIdeTedap + i,
                ide_cpcfa: aplicacion.ide_cpcfa,
                valor: aplicacion.valor,
                ide_cnccc: asiento.ide_cnccc ?? null,
            });
        }

        const nuevoLiquidado = Number(cab.valor_liquidado_teanp) + totalAplicar;
        const quedaLiquidado = Number(cab.valor_teanp) - nuevoLiquidado <= TOLERANCIA_CENTAVOS;
        const nuevoEstado = quedaLiquidado ? ESTADO_LIQUIDADO : ESTADO_PARCIALMENTE_LIQUIDADO;

        const queryRunner = await this.dataSource.pool.connect();
        try {
            await queryRunner.query('BEGIN');
            for (const det of detalles) {
                await queryRunner.query(
                    `INSERT INTO tes_det_anticipo_prov (
                        ide_tedap, ide_teanp, ide_cpcfa, valor_aplicado_tedap, ide_cnccc,
                        fecha_tedap, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [det.ide_tedap, dtoIn.ide_teanp, det.ide_cpcfa, det.valor, det.ide_cnccc,
                        this.hoy(), dtoIn.login, getCurrentTime()],
                );
            }
            await queryRunner.query(
                `UPDATE tes_cab_anticipo_prov
                    SET valor_liquidado_teanp = $1, ide_teeap = $2, usuario_actua = $3, hora_actua = $4
                  WHERE ide_teanp = $5`,
                [nuevoLiquidado, nuevoEstado, dtoIn.login, getCurrentTime(), dtoIn.ide_teanp],
            );
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

        return { message: 'ok', ide_teanp: dtoIn.ide_teanp, nuevo_estado: nuevoEstado, saldo_restante: Number(cab.valor_teanp) - nuevoLiquidado };
    }

    /** Anula un anticipo que todavía no tiene ninguna liquidación activa: reversa el movimiento
     * de tesorería y su asiento. Si ya tiene liquidaciones, hay que revertirlas primero (no se
     * soporta anular en cascada, para no perder trazabilidad de facturas ya reclasificadas). */
    async anular(ideTeanp: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT ide_teclb, ide_cnccc, ide_teeap, valor_liquidado_teanp
            FROM tes_cab_anticipo_prov WHERE ide_teanp = $1
        `);
        qCab.addIntParam(1, ideTeanp);
        const cab = await this.dataSource.createSingleQuery(qCab);
        if (!cab) {
            throw new BadRequestException(`Anticipo a proveedor ide_teanp=${ideTeanp} no encontrado.`);
        }
        if (Number(cab.ide_teeap) === ESTADO_ANULADO) {
            throw new BadRequestException('Este anticipo ya está anulado.');
        }
        if (Number(cab.valor_liquidado_teanp) > 0) {
            throw new BadRequestException(
                'Este anticipo ya tiene liquidaciones aplicadas - no se puede anular directamente.',
            );
        }

        await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: Number(cab.ide_teclb) });

        await this.dataSource.pool.query(
            `UPDATE tes_cab_anticipo_prov SET ide_teeap = $1, activo_teanp = false WHERE ide_teanp = $2`,
            [ESTADO_ANULADO, ideTeanp],
        );

        return { message: 'ok', ide_teanp: ideTeanp };
    }

    private hoy(): string {
        return new Date().toISOString().slice(0, 10);
    }
}
