import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { CxpTransaccionesSaveService } from 'src/core/modules/tesoreria/cxp-transacciones/cxp-transacciones-save.service';
import { PreLibroBancosSaveService } from 'src/core/modules/tesoreria/pre-libro-bancos/pre-libro-bancos-save.service';
import { RetencionVentaSaveService } from 'src/core/modules/ventas/facturas/retencion-venta-save.service';
import { toPgTimestampNow } from 'src/util/helpers/date-util';

import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';
import { AnularDevolucionTarjetaDto } from './dto/anular-devolucion-tarjeta.dto';
import { RegistrarCorteTarjetaDto } from './dto/registrar-corte-tarjeta.dto';

const IDE_CNIMP_RENTA = 1;

const toCents = (value: number | string | null | undefined): number => Math.round(Number(value || 0) * 100);
const centsToAmount = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * Registro de un CORTE de un procesador de tarjeta (ej. Bendo, dos al mes): su factura de comisión
 * y/o su comprobante de retención sobre el mismo conjunto de pagos (facturas de venta cobradas con
 * tarjeta). Cada documento se contabiliza contra la cuenta de tarjeta - pago de la comisión y nota
 * de débito + asiento de la retención - sin depender de que las acreditaciones de esos pagos ya
 * estén registradas: la cuenta de tarjeta baja por el neto (acreditación), la comisión y la
 * retención, cada uno cuando llega su documento, hasta quedar en cero.
 *
 * La retención se registra con RetencionVentaSaveService.saveRetencionLote (valida que la base y el
 * IVA de los pagos cuadren con el XML y reparte el valor por factura). Nota sobre atomicidad: cada
 * paso usa su propio mecanismo transaccional; ante un fallo se revierten los movimientos y la
 * retención ya registrados (compensación best-effort) y se relanza el error.
 */
@Injectable()
export class CorteTarjetaSaveService extends BaseService {
    private readonly logger = new Logger(CorteTarjetaSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: DevolucionCobroTarjetaService,
        private readonly cxpTransaccionesSaveService: CxpTransaccionesSaveService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
        private readonly retencionVentaSaveService: RetencionVentaSaveService,
    ) {
        super();
        this.core
            .getVariables(['p_tes_nota_debito'])
            .then((result) => {
                this.variables = result;
            });
    }

    async registrarCorte(dtoIn: RegistrarCorteTarjetaDto & HeaderParamsDto) {
        // ─── PASO 1: VALIDACIONES ─────────────────────────────────────────────
        if (!dtoIn.ideCpcfa && !dtoIn.retencion) {
            throw new BadRequestException('Un corte necesita la factura de comisión, el comprobante de retención o ambos');
        }
        if (new Set(dtoIn.facturas).size !== dtoIn.facturas.length) {
            throw new BadRequestException('Hay pagos repetidos en la selección');
        }

        const info = await this.consultas.getInfoFacturasParaCorte(dtoIn.facturas, dtoIn.ideTecba, dtoIn);
        const infoPorCccfa = new Map(info.map((i) => [Number(i.ide_cccfa), i]));
        for (const ideCccfa of dtoIn.facturas) {
            const f = infoPorCccfa.get(ideCccfa);
            if (!f) {
                throw new BadRequestException(
                    `La factura ide_cccfa=${ideCccfa} no corresponde a un cobro registrado con la cuenta de tarjeta seleccionada`,
                );
            }
            if (f.en_corte) {
                throw new BadRequestException(`La factura N.${f.secuencial_cccfa} ya pertenece a otro corte`);
            }
            if (dtoIn.retencion && f.ide_cncre) {
                throw new BadRequestException(`La factura N.${f.secuencial_cccfa} ya tiene un comprobante de retención registrado`);
            }
        }

        const advertencias: string[] = [];
        // Procesador configurado en la cuenta de tarjeta (o, por defecto, en su banco)
        const ideGeperProcesador = await this.consultas.getProcesadorCuenta(dtoIn.ideTecba);
        if (!ideGeperProcesador) {
            throw new BadRequestException('La cuenta de tarjeta no tiene configurado el proveedor (procesador) que factura la comisión y emite la retención');
        }
        const ideGeper: number = ideGeperProcesador;
        let facturaComision: Record<string, any> | null = null;
        if (dtoIn.ideCpcfa) {
            facturaComision = await this.consultas.getFacturaCxPInfo(dtoIn.ideCpcfa, dtoIn);
            if (!facturaComision) {
                throw new BadRequestException(`La factura de comisión ide_cpcfa=${dtoIn.ideCpcfa} no existe`);
            }
            if (facturaComision.pagado_cpcfa) {
                throw new BadRequestException('La factura de comisión ya se encuentra pagada');
            }
            if (Number(facturaComision.ide_geper) !== ideGeper) {
                throw new BadRequestException(
                    'La factura de comisión no pertenece al procesador de la cuenta de tarjeta seleccionada',
                );
            }

            // Conciliación contra la liquidación del procesador: solo si TODOS los pagos ya tienen
            // los valores de su Excel (si falta alguna acreditación no se puede verificar aún)
            const liquidados = await this.consultas.getComisionLiquidadaPagos(dtoIn.facturas);
            if (liquidados.completo) {
                const diff = liquidados.totalCents - toCents(facturaComision.total_cpcfa);
                if (Math.abs(diff) > 2) {
                    advertencias.push(
                        `La comisión de la liquidación (${centsToAmount(liquidados.totalCents).toFixed(2)}) difiere de la factura (${Number(facturaComision.total_cpcfa).toFixed(2)}).`,
                    );
                }
            } else {
                advertencias.push('La comisión no se pudo verificar contra la liquidación: faltan acreditaciones de algunos pagos.');
            }
        }

        // Tipo de impuesto (Renta/IVA) de cada línea del comprobante de retención
        let retIvaCents = 0;
        let retRentaCents = 0;
        let ideCncimIva: number | null = null;
        let ideCncimRenta: number | null = null;
        if (dtoIn.retencion) {
            const qTipos = new SelectQuery(`SELECT ide_cncim, ide_cnimp FROM con_cabece_impues WHERE ide_cncim = ANY($1)`);
            qTipos.addParam(1, dtoIn.retencion.detalles.map((d) => d.ide_cncim));
            const tipos = await this.dataSource.createSelectQuery(qTipos);
            const tipoPorCncim = new Map(tipos.map((t) => [Number(t.ide_cncim), Number(t.ide_cnimp)]));
            for (const d of dtoIn.retencion.detalles) {
                if (tipoPorCncim.get(d.ide_cncim) === IDE_CNIMP_RENTA) {
                    retRentaCents += toCents(d.valor_cndre);
                    ideCncimRenta = d.ide_cncim;
                } else {
                    retIvaCents += toCents(d.valor_cndre);
                    ideCncimIva = d.ide_cncim;
                }
            }
        }

        // Movimientos de libro banco creados (para compensar si algo falla) y asientos de compra
        const movimientos: number[] = [];
        const asientosGenerados: number[] = [];
        let ideCncre: number | null = null;
        try {
            // ─── PASO 2: COMPROBANTE DE RETENCIÓN (valida cuadre y reparte por factura) ─
            if (dtoIn.retencion) {
                const guardada = await this.retencionVentaSaveService.saveRetencionLote({
                    ...dtoIn,
                    fecha_emisi_cncre: dtoIn.retencion.fecha_emisi_cncre,
                    numero_cncre: dtoIn.retencion.numero_cncre,
                    autorizacion_cncre: dtoIn.retencion.autorizacion_cncre,
                    observacion_cncre: `Retención tarjeta - ${dtoIn.facturas.length} pago(s)`,
                    detalles: dtoIn.retencion.detalles,
                    facturas: dtoIn.facturas,
                });
                ideCncre = Number(guardada.ide_cncre);
            }

            // ─── PASO 3: PAGO DE LA FACTURA DE COMISIÓN CONTRA LA CUENTA DE TARJETA ────
            let ideTeclbPagoComision: number | null = null;
            if (facturaComision) {
                if (!facturaComision.ide_cnccc) {
                    const asientoCompra = await this.asientosAutomaticosService.generarAsientoComprasCxP({
                        ide_cpcfa: dtoIn.ideCpcfa!,
                        ...dtoIn,
                    });
                    if (!asientoCompra.generado) {
                        throw new BadRequestException(
                            `No se pudo generar el asiento de la factura de comisión: ${(asientoCompra.advertencias ?? []).join('; ') || 'error desconocido'}`,
                        );
                    }
                    if (asientoCompra.ide_cnccc) asientosGenerados.push(asientoCompra.ide_cnccc);
                }
                const pago = await this.cxpTransaccionesSaveService.savePagoCxP({
                    ...dtoIn,
                    ideGeper: Number(facturaComision.ide_geper),
                    fecha: dtoIn.fecha,
                    ideTecba: dtoIn.ideTecba,
                    ideTettb: Number(this.variables.get('p_tes_nota_debito')),
                    valor: Number(facturaComision.total_cpcfa),
                    observacion: `Pago comisión tarjeta N.${facturaComision.numero_cpcfa}${dtoIn.observacion ? ' - ' + dtoIn.observacion : ''}`,
                    facturas: [{
                        ide_cpctr: Number(facturaComision.ide_cpctr),
                        ide_cpcfa: dtoIn.ideCpcfa!,
                        valor: Number(facturaComision.total_cpcfa),
                    }],
                });
                ideTeclbPagoComision = Number(pago.ide_teclb);
                movimientos.push(ideTeclbPagoComision);
            }

            // ─── PASO 4: NOTA DE DÉBITO + ASIENTO DE LA RETENCIÓN ──────────────────
            let ideTeclbDebitoRetencion: number | null = null;
            if (dtoIn.retencion && retIvaCents + retRentaCents > 0) {
                const ideTettbNotaDebito = Number(this.variables.get('p_tes_nota_debito'));
                const observacion = `Retención SRI cobros con tarjeta N.${dtoIn.retencion.numero_cncre}`;
                const numeroDebito = await this.preLibroBancosSaveService.generarNumeroAutomatico(
                    dtoIn.ideTecba, ideTettbNotaDebito, dtoIn,
                );
                const movDebito = await this.preLibroBancosSaveService.generarLibroBancoOtros({
                    ...dtoIn,
                    ideTecba: dtoIn.ideTecba,
                    ideTettb: ideTettbNotaDebito,
                    valor: centsToAmount(retIvaCents + retRentaCents),
                    fecha: dtoIn.fecha,
                    numero: numeroDebito,
                    observacion,
                    beneficiario: facturaComision?.nom_geper ?? '',
                });
                ideTeclbDebitoRetencion = Number(movDebito.ide_teclb);
                movimientos.push(ideTeclbDebitoRetencion);

                const asiento = await this.asientosAutomaticosService.generarAsientoRetencionTarjeta({
                    ...dtoIn,
                    ideTeclb: ideTeclbDebitoRetencion,
                    fecha: dtoIn.fecha,
                    ideTecba: dtoIn.ideTecba,
                    ideGeper,
                    valorRetencionIva: centsToAmount(retIvaCents),
                    valorRetencionRenta: centsToAmount(retRentaCents),
                    ideCncimIva,
                    ideCncimRenta,
                    observacion,
                });
                if (!asiento.generado) {
                    throw new BadRequestException(
                        `No se pudo generar el asiento de la retención N.${dtoIn.retencion.numero_cncre}: ${(asiento.advertencias ?? []).join('; ') || 'error desconocido'}`,
                    );
                }
            }

            // ─── PASO 5: CABECERA + PAGOS DEL CORTE ───────────────────────────────
            const ideTecct = await this.dataSource.getSeqTable('tes_cab_corte_tarjeta', 'ide_tecct', 1, dtoIn.login);
            const baseIdeTedct = await this.dataSource.getSeqTable(
                'tes_det_corte_tarjeta', 'ide_tedct', dtoIn.facturas.length, dtoIn.login,
            );
            const listQuery: ObjectQueryDto[] = [
                {
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'cab_corte_tarjeta',
                    primaryKey: 'ide_tecct',
                    object: {
                        ide_tecct: ideTecct,
                        ide_empr: dtoIn.ideEmpr,
                        ide_sucu: dtoIn.ideSucu,
                        ide_tecba: dtoIn.ideTecba,
                        fecha_tecct: dtoIn.fecha,
                        ide_geper: dtoIn.ideCpcfa ? ideGeper : null,
                        ide_cpcfa: dtoIn.ideCpcfa ?? null,
                        ide_teclb_pago_comision: ideTeclbPagoComision,
                        ide_cncre: ideCncre,
                        ide_teclb_debito_retencion: ideTeclbDebitoRetencion,
                        observacion_tecct: dtoIn.observacion ?? null,
                        usuario_ingre: dtoIn.login,
                    },
                },
                ...dtoIn.facturas.map((ideCccfa, i): ObjectQueryDto => ({
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'det_corte_tarjeta',
                    primaryKey: 'ide_tedct',
                    object: {
                        ide_tedct: baseIdeTedct + i,
                        ide_tecct: ideTecct,
                        ide_cccfa: ideCccfa,
                        usuario_ingre: dtoIn.login,
                    },
                })),
            ];
            await this.core.save({ ...dtoIn, listQuery, audit: false });

            return { message: 'ok', ide_tecct: ideTecct, ide_cncre: ideCncre, advertencias };
        } catch (error) {
            // Compensación best-effort: reversa los movimientos (con su asiento), los asientos de
            // compra generados y el comprobante de retención ya registrado.
            for (const ideTeclb of movimientos) {
                await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb }).catch(() => undefined);
            }
            for (const ideCnccc of asientosGenerados) {
                await this.asientosAutomaticosService.eliminarAsiento(ideCnccc, dtoIn).catch(() => undefined);
            }
            if (ideCncre) {
                await this.retencionVentaSaveService.anularRetencion({ ...dtoIn, ide_cncre: ideCncre }, true).catch(() => undefined);
            }
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Error al registrar el corte de cobros con tarjeta: ${error}`);
            throw error;
        }
    }

    /**
     * Anula un corte para poder registrarlo de nuevo: reversa la retención (queda anulado el
     * comprobante y libres sus facturas, de modo que el XML se puede cargar otra vez), la nota de
     * débito de la retención y el pago de la comisión (la factura queda pendiente de pago), y
     * libera los pagos. La factura de comisión NO se anula: es un documento real del proveedor.
     */
    async anularCorte(ideTecct: number, dtoIn: AnularDevolucionTarjetaDto & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT ide_tecct, anulado_tecct, ide_cncre, ide_teclb_pago_comision, ide_teclb_debito_retencion
            FROM tes_cab_corte_tarjeta
            WHERE ide_tecct = $1 AND ide_empr = $2 AND ide_sucu = $3
        `);
        q.addIntParam(1, ideTecct);
        q.addIntParam(2, dtoIn.ideEmpr);
        q.addIntParam(3, dtoIn.ideSucu);
        const corte = await this.dataSource.createSingleQuery(q);
        if (!corte) throw new BadRequestException(`El corte ide_tecct=${ideTecct} no existe`);
        if (corte.anulado_tecct) throw new BadRequestException('Este corte ya se encuentra anulado');

        // Primero la retención: si ya se aplicó a un cobro, falla sin haber tocado nada más
        if (corte.ide_cncre) {
            await this.retencionVentaSaveService.anularRetencion({ ...dtoIn, ide_cncre: Number(corte.ide_cncre) }, true);
        }
        if (corte.ide_teclb_debito_retencion) {
            await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: Number(corte.ide_teclb_debito_retencion) });
        }
        if (corte.ide_teclb_pago_comision) {
            await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: Number(corte.ide_teclb_pago_comision) });
        }

        await this.dataSource.pool.query(`DELETE FROM tes_det_corte_tarjeta WHERE ide_tecct = $1`, [ideTecct]);
        const listQuery: ObjectQueryDto[] = [{
            operation: 'update',
            module: 'tes',
            tableName: 'cab_corte_tarjeta',
            primaryKey: 'ide_tecct',
            object: {
                ide_tecct: ideTecct,
                anulado_tecct: true,
                fecha_anula_tecct: toPgTimestampNow(),
                motivo_anula_tecct: dtoIn.motivo ?? null,
                usuario_anula: dtoIn.login,
            },
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_tecct: ideTecct };
    }
}
