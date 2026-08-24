import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { ComprobanteBancoSaveService } from 'src/core/modules/tesoreria/comprobante-banco/comprobante-banco-save.service';
import { CxpTransaccionesSaveService } from 'src/core/modules/tesoreria/cxp-transacciones/cxp-transacciones-save.service';
import { PreLibroBancosSaveService } from 'src/core/modules/tesoreria/pre-libro-bancos/pre-libro-bancos-save.service';

import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';
import { FinalizarDevolucionTarjetaDto } from './dto/finalizar-devolucion-tarjeta.dto';

/** Tipo de impuesto renta en con_cabece_impues.ide_cnimp (paridad AsientosAutomaticosService) */
const IDE_CNIMP_RENTA = 1;

/**
 * Aritmética monetaria en centavos enteros: JS no representa exactamente todos los decimales
 * en binario (ej. 0.1 + 0.2 === 0.30000000000000004), así que sumar/restar dólares en punto
 * flotante y solo redondear al final puede arrastrar centavos de diferencia cuando hay varias
 * facturas o porcentajes que no cierran limpio. Todo el cálculo del neto de esta orquestación
 * se hace en centavos (enteros, sin ese problema) y solo se vuelve a dólares al final, para
 * persistir/mostrar/comparar - garantiza que el resultado nunca difiera en centavos por
 * redondeo intermedio.
 */
const toCents = (value: number | string | null | undefined): number => Math.round(Number(value || 0) * 100);
const centsToAmount = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * Orquesta el ciclo completo de una Devolución de Cobros con Tarjeta (ver plan de
 * implementación): factura(s) de venta cobradas con tarjeta -> factura de comisión del
 * procesador (CxP) -> retención SRI recibida (opcional) -> transferencia del neto a la cuenta
 * real, dejando la cuenta del procesador en cero.
 *
 * La factura de comisión y la retención (si aplica) NO se crean aquí: el frontend las guarda
 * ANTES de llamar a este endpoint reutilizando los diálogos existentes de Compras
 * (CrearFacturaCxPDialog) y Ventas (RegistrarRetencionVentaDialog) - cada uno ya sabe parsear el
 * XML y persistir con su propio flujo probado. Este servicio solo recibe sus IDs (`ide_cpcfa`,
 * `ide_cncre`) y encadena el resto: pago de la comisión, nota de débito de la retención,
 * transferencia del neto y trazabilidad, todo en una única llamada (finalizar).
 *
 * Nota sobre atomicidad: cada paso (pagar, generar asiento, transferir) usa su propio mecanismo
 * transaccional interno (igual que el resto de Tesorería), pero no existe una transacción SQL
 * única que envuelva TODOS los pasos - sería necesario refactorizar esos servicios para aceptar
 * un queryRunner externo, fuera del alcance de esta funcionalidad. Ante un fallo a mitad de
 * camino se revierten los asientos contables ya generados (compensación best-effort, igual
 * criterio que CxcTransaccionesSaveService/CxpTransaccionesSaveService) y se relanza el error con
 * el detalle de en qué paso falló, para que el usuario complete o corrija manualmente lo que ya
 * se alcanzó a registrar (ej. vía las pantallas normales de Tesorería).
 */
@Injectable()
export class DevolucionCobroTarjetaSaveService extends BaseService {
    private readonly logger = new Logger(DevolucionCobroTarjetaSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: DevolucionCobroTarjetaService,
        private readonly cxpTransaccionesSaveService: CxpTransaccionesSaveService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly comprobanteBancoSaveService: ComprobanteBancoSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
    ) {
        super();
        this.core
            .getVariables(['p_tes_nota_debito'])
            .then((result) => {
                this.variables = result;
            });
    }

    async finalizar(dtoIn: FinalizarDevolucionTarjetaDto & HeaderParamsDto) {
        // ─── PASO 1: VALIDACIONES ─────────────────────────────────────────────
        if (!dtoIn.facturas?.length) {
            throw new BadRequestException('Debe seleccionar al menos una factura de venta cobrada con tarjeta');
        }
        if (!dtoIn.ideCpcfa) {
            throw new BadRequestException('Debe cargar o seleccionar la factura de comisión del proveedor');
        }
        if (!dtoIn.comprobante?.fotoTeincb) {
            throw new BadRequestException('Debe cargar el comprobante de la transferencia bancaria');
        }

        const ideCccfaList = dtoIn.facturas.map((f) => f.ide_cccfa);
        const infoFacturas = await this.consultas.getInfoFacturasCobradasTarjeta(ideCccfaList, dtoIn.ideTecba, dtoIn);
        const infoPorCccfa = new Map(infoFacturas.map((info) => [Number(info.ide_cccfa), info]));

        for (const f of dtoIn.facturas) {
            const info = infoPorCccfa.get(f.ide_cccfa);
            if (!info) {
                throw new BadRequestException(
                    `La factura ide_cccfa=${f.ide_cccfa} no corresponde a un cobro registrado con la cuenta de tarjeta seleccionada`,
                );
            }
            if (info.ya_cubierta) {
                throw new BadRequestException(
                    `La factura N.${info.secuencial_cccfa} ya fue cubierta por otra devolución de cobros con tarjeta`,
                );
            }
        }
        const valorTotalCobrosCents = dtoIn.facturas.reduce((sum, f) => sum + toCents(f.valor), 0);
        const valorTotalCobros = centsToAmount(valorTotalCobrosCents);

        const ideTettbNotaDebito = Number(this.variables.get('p_tes_nota_debito'));

        const asientosGenerados: number[] = [];

        try {
            // ─── PASO 2: FACTURA DE COMISIÓN (CxP) - ya guardada por el frontend ─
            const ideCpcfa = dtoIn.ideCpcfa;
            const facturaComision = await this.consultas.getFacturaCxPInfo(ideCpcfa, dtoIn);
            if (!facturaComision) {
                throw new BadRequestException(`La factura de comisión ide_cpcfa=${ideCpcfa} no existe`);
            }
            if (Number(facturaComision.ide_geper) !== dtoIn.ideGeper) {
                throw new BadRequestException('La factura de comisión no pertenece al proveedor seleccionado');
            }
            if (facturaComision.pagado_cpcfa) {
                throw new BadRequestException('La factura de comisión ya se encuentra pagada');
            }

            // Genera el asiento de la compra si aún no lo tiene (documento recién creado, o uno
            // existente que se cargó por el módulo de Compras sin pasar por Contabilidad aún).
            if (!facturaComision.ide_cnccc) {
                const asientoCompra = await this.asientosAutomaticosService.generarAsientoComprasCxP({
                    ide_cpcfa: ideCpcfa,
                    ...dtoIn,
                });
                if (!asientoCompra.generado) {
                    throw new BadRequestException(
                        `No se pudo generar el asiento de la factura de comisión: ${(asientoCompra.advertencias ?? []).join('; ') || 'error desconocido'}`,
                    );
                }
                if (asientoCompra.ide_cnccc) asientosGenerados.push(asientoCompra.ide_cnccc);
            }

            // ─── PASO 3: PAGAR LA COMISIÓN CONTRA LA CUENTA DE TARJETA (NOTA DE DÉBITO) ─
            const pago = await this.cxpTransaccionesSaveService.savePagoCxP({
                ...dtoIn,
                ideGeper: dtoIn.ideGeper,
                fecha: dtoIn.fecha,
                ideTecba: dtoIn.ideTecba,
                ideTettb: ideTettbNotaDebito,
                valor: Number(facturaComision.total_cpcfa),
                observacion: `Pago comisión tarjeta N.${facturaComision.numero_cpcfa}${dtoIn.observacion ? ' - ' + dtoIn.observacion : ''}`,
                facturas: [{
                    ide_cpctr: Number(facturaComision.ide_cpctr),
                    ide_cpcfa: ideCpcfa,
                    valor: Number(facturaComision.total_cpcfa),
                }],
            });
            if (pago.asiento_contable?.ide_cnccc) asientosGenerados.push(pago.asiento_contable.ide_cnccc);

            // ─── PASO 4: RETENCIÓN (OPCIONAL) ──────────────────────────────────
            // El comprobante de retención de un procesador de tarjeta puede amparar VARIAS
            // facturas de venta (esquema SRI v2.0.0 multi-documento sustento - caso Bendo), pero
            // RegistrarRetencionVentaDialog/RetencionVentaSaveService vinculan el comprobante a
            // UNA sola cxc_cabece_factura (ide_cncre es un campo puntual de esa tabla) - el
            // frontend lo guarda contra la PRIMERA factura del lote como ancla documental/SRI
            // antes de llamar a este endpoint. La trazabilidad real multi-factura vive en
            // tes_det_devol_cobro_tarjeta_fact (PASO 8), no en ese vínculo.
            let ideCncre: number | null = null;
            let valorRetencionIvaCents = 0;
            let valorRetencionRentaCents = 0;
            let ideCncimIva: number | null = null;
            let ideCncimRenta: number | null = null;

            if (dtoIn.ideCncre) {
                const detalle = await this.consultas.getDetalleRetencionVenta(dtoIn.ideCncre, dtoIn);
                if (!detalle) {
                    throw new BadRequestException(`La retención ide_cncre=${dtoIn.ideCncre} no existe`);
                }
                ideCncre = dtoIn.ideCncre;
                for (const d of detalle.detalles) {
                    if (Number(d.ide_cnimp) === IDE_CNIMP_RENTA) {
                        valorRetencionRentaCents += toCents(d.valor_cndre);
                        ideCncimRenta = Number(d.ide_cncim);
                    } else {
                        valorRetencionIvaCents += toCents(d.valor_cndre);
                        ideCncimIva = Number(d.ide_cncim);
                    }
                }
            }

            const valorRetencionIva = centsToAmount(valorRetencionIvaCents);
            const valorRetencionRenta = centsToAmount(valorRetencionRentaCents);
            const totalRetencionCents = valorRetencionIvaCents + valorRetencionRentaCents;
            const totalRetencion = centsToAmount(totalRetencionCents);
            let ideTeclbDebitoRetencion: number | null = null;
            if (totalRetencionCents > 0) {
                const numeroDebito = await this.preLibroBancosSaveService.generarNumeroAutomatico(
                    dtoIn.ideTecba, ideTettbNotaDebito, dtoIn,
                );
                const movDebito = await this.preLibroBancosSaveService.generarLibroBancoOtros({
                    ...dtoIn,
                    ideTecba: dtoIn.ideTecba,
                    ideTettb: ideTettbNotaDebito,
                    valor: totalRetencion,
                    fecha: dtoIn.fecha,
                    numero: numeroDebito,
                    observacion: 'Retención SRI cobros con tarjeta',
                    beneficiario: facturaComision.nom_geper ?? '',
                });
                ideTeclbDebitoRetencion = movDebito.ide_teclb;

                const asientoRetencion = await this.asientosAutomaticosService.generarAsientoRetencionTarjeta({
                    ...dtoIn,
                    ideTeclb: ideTeclbDebitoRetencion,
                    fecha: dtoIn.fecha,
                    ideTecba: dtoIn.ideTecba,
                    ideGeper: dtoIn.ideGeper,
                    valorRetencionIva,
                    valorRetencionRenta,
                    ideCncimIva,
                    ideCncimRenta,
                    observacion: 'Retención SRI cobros con tarjeta',
                });
                if (!asientoRetencion.generado) {
                    throw new BadRequestException(
                        `No se pudo generar el asiento de la retención: ${(asientoRetencion.advertencias ?? []).join('; ') || 'error desconocido'}`,
                    );
                }
                if (asientoRetencion.ide_cnccc) asientosGenerados.push(asientoRetencion.ide_cnccc);
            }

            // ─── PASO 5: CALCULAR NETO Y COMPARAR CONTRA EL COMPROBANTE ────────
            // Total cobrado − comisión (con IVA) − retenciones, todo en centavos (ver toCents)
            // para que el resultado nunca difiera en centavos por redondeo intermedio.
            const valorComisionTotalCents = toCents(facturaComision.total_cpcfa);
            const valorIvaComisionCents = toCents(facturaComision.valor_iva_cpcfa);
            const valorComisionTotal = centsToAmount(valorComisionTotalCents);
            const valorIvaComision = centsToAmount(valorIvaComisionCents);
            const valorNetoCalculadoCents =
                valorTotalCobrosCents - valorComisionTotalCents - totalRetencionCents;
            const valorNetoCalculado = centsToAmount(valorNetoCalculadoCents);

            const advertencias: string[] = [];
            const diferenciaCents = toCents(dtoIn.comprobante.valorTeincb) - valorNetoCalculadoCents;
            if (Math.abs(diferenciaCents) > 1) {
                advertencias.push(
                    `El valor transferido (${dtoIn.comprobante.valorTeincb.toFixed(2)}) difiere del neto calculado por el sistema (${valorNetoCalculado.toFixed(2)}). Diferencia: ${centsToAmount(diferenciaCents).toFixed(2)}.`,
                );
            }

            // ─── PASO 6: TRANSFERENCIA DEL NETO A LA CUENTA DESTINO ────────────
            // Se transfiere el valor REALMENTE depositado según el comprobante (fuente de
            // verdad del movimiento bancario), no el calculado - la diferencia, si la hay, ya
            // quedó reportada como advertencia arriba (no bloquea, según lo acordado).
            // generarTransferencia ya genera su propio asiento (cuenta destino DEBE / cuenta
            // origen HABER, vía AsientosAutomaticosService.generarAsientoTransferencia) y admite
            // adjuntar un comprobante atómicamente - pero ese comprobante inline queda marcado
            // 'enviada' y ligado al movimiento de RETIRO (semántica de "yo transfiero"). En este
            // flujo el comprobante es la prueba de que Guayaquil RECIBIÓ el depósito del
            // procesador (semántica de "yo recibo"), así que se guarda aparte en el PASO 7,
            // ligado al movimiento de INGRESO con tipo 'recibida' - más preciso para reportes y
            // conciliación, a costa de no ser parte de la misma transacción SQL atómica (ver nota
            // de atomicidad al inicio de este servicio).
            const transferencia = await this.preLibroBancosSaveService.generarTransferencia({
                ...dtoIn,
                ideTecbaOrigen: dtoIn.ideTecba,
                ideTecbaDestino: dtoIn.ideTecbaDestino,
                valor: dtoIn.comprobante.valorTeincb,
                fecha: dtoIn.fecha,
                observacion: `Acreditación cobros con tarjeta${dtoIn.observacion ? ' - ' + dtoIn.observacion : ''}`,
                numero: dtoIn.comprobante.numComprobanteTeincb || 'S/N',
            } as any);
            if (transferencia.ide_cnccc) asientosGenerados.push(transferencia.ide_cnccc);

            // ─── PASO 7: PERSISTIR EL COMPROBANTE DE TRANSFERENCIA ─────────────
            const comprobanteGuardado = await this.comprobanteBancoSaveService.saveComprobante({
                ...dtoIn,
                ideTeclb: transferencia.ide_teclb_ingreso,
                fotoTeincb: dtoIn.comprobante.fotoTeincb,
                tipoTrnsTeincb: 'recibida',
                valorTeincb: dtoIn.comprobante.valorTeincb,
                numComprobanteTeincb: dtoIn.comprobante.numComprobanteTeincb,
                fechaTeincb: dtoIn.comprobante.fechaTeincb,
                ordenanteTeincb: dtoIn.comprobante.ordenanteTeincb,
                cuentaOrigenTeincb: dtoIn.comprobante.cuentaOrigenTeincb,
                bancoOrigenTeincb: dtoIn.comprobante.bancoOrigenTeincb,
                beneficiarioTeincb: dtoIn.comprobante.beneficiarioTeincb,
                cuentaDestinoTeincb: dtoIn.comprobante.cuentaDestinoTeincb,
                bancoDestinoTeincb: dtoIn.comprobante.bancoDestinoTeincb,
                textoOriginalTeincb: dtoIn.comprobante.textoOriginalTeincb,
                porOcrTeincb: dtoIn.comprobante.porOcrTeincb,
                porIaTeincb: dtoIn.comprobante.porIaTeincb,
                validadoTeincb: true,
            } as any);

            // ─── PASO 8: CABECERA + DETALLE DE TRAZABILIDAD ────────────────────
            const ideTecdt = await this.dataSource.getSeqTable(
                'tes_cab_devol_cobro_tarjeta', 'ide_tecdt', 1, dtoIn.login,
            );
            const baseIdeTedtf = await this.dataSource.getSeqTable(
                'tes_det_devol_cobro_tarjeta_fact', 'ide_tedtf', dtoIn.facturas.length, dtoIn.login,
            );

            const listQuery: ObjectQueryDto[] = [
                {
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'cab_devol_cobro_tarjeta',
                    primaryKey: 'ide_tecdt',
                    object: {
                        ide_tecdt: ideTecdt,
                        ide_empr: dtoIn.ideEmpr,
                        ide_sucu: dtoIn.ideSucu,
                        ide_tecba: dtoIn.ideTecba,
                        ide_geper: dtoIn.ideGeper,
                        ide_cpcfa: ideCpcfa,
                        ide_cncre: ideCncre,
                        ide_teincb: (comprobanteGuardado as any).ideTeincb ?? null,
                        ide_tecba_destino: dtoIn.ideTecbaDestino,
                        ide_teclb_pago_comision: pago.ide_teclb,
                        ide_teclb_debito_retencion: ideTeclbDebitoRetencion,
                        ide_teclb_retiro: transferencia.ide_teclb_retiro,
                        ide_teclb_ingreso: transferencia.ide_teclb_ingreso,
                        fecha_tecdt: dtoIn.fecha,
                        valor_total_cobros_tecdt: valorTotalCobros,
                        valor_comision_tecdt: centsToAmount(valorComisionTotalCents - valorIvaComisionCents),
                        valor_iva_comision_tecdt: valorIvaComision,
                        valor_retencion_iva_tecdt: valorRetencionIva,
                        valor_retencion_renta_tecdt: valorRetencionRenta,
                        valor_neto_calculado_tecdt: valorNetoCalculado,
                        valor_neto_transferido_tecdt: dtoIn.comprobante.valorTeincb,
                        observacion_tecdt: dtoIn.observacion ?? null,
                        usuario_ingre: dtoIn.login,
                    },
                },
                ...dtoIn.facturas.map((f, i): ObjectQueryDto => ({
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'det_devol_cobro_tarjeta_fact',
                    primaryKey: 'ide_tedtf',
                    object: {
                        ide_tedtf: baseIdeTedtf + i,
                        ide_tecdt: ideTecdt,
                        ide_cccfa: f.ide_cccfa,
                        valor_cccfa_tedtf: f.valor,
                        usuario_ingre: dtoIn.login,
                    },
                })),
            ];
            await this.core.save({ ...dtoIn, listQuery, audit: false });

            return {
                message: 'ok',
                ide_tecdt: ideTecdt,
                ide_cpcfa: ideCpcfa,
                ide_cncre: ideCncre,
                valor_neto_calculado: valorNetoCalculado,
                valor_neto_transferido: dtoIn.comprobante.valorTeincb,
                advertencias,
            };
        } catch (error) {
            // Compensación best-effort: revierte los asientos contables ya generados en pasos
            // previos. Los movimientos de tesorería (pago CxP, nota de débito, transferencia) NO
            // se revierten automáticamente - no existe hoy un "anular" genérico reutilizable para
            // esos pasos sin duplicar lógica de cada servicio; quedan visibles en Tesorería para
            // anulación manual si el proceso no llegó a completarse.
            for (const ideCnccc of asientosGenerados) {
                await this.asientosAutomaticosService.eliminarAsiento(ideCnccc, dtoIn);
            }
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Error al finalizar devolución de cobros con tarjeta: ${error}`);
            throw error;
        }
    }
}
