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
import { getCurrentDate, toPgTimestampNow } from 'src/util/helpers/date-util';

import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';
import { AdjuntarRetencionDevolucionTarjetaDto } from './dto/adjuntar-retencion-devolucion-tarjeta.dto';
import { AnularDevolucionTarjetaDto } from './dto/anular-devolucion-tarjeta.dto';
import { FinalizarDevolucionTarjetaDto } from './dto/finalizar-devolucion-tarjeta.dto';

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
 * La factura de comisión y el comprobante de retención (si aplica) NO se crean aquí: la comisión
 * la guarda el frontend ANTES de llamar a este endpoint (CrearFacturaCxPDialog, Compras) y recibe
 * su `ide_cpcfa`; la retención se registra aparte sobre las facturas de venta que ampara
 * (RetencionVentaSaveService.saveRetencionLote) y aquí se toma sola de las facturas del ciclo.
 * Este servicio encadena el resto: pago de la comisión, nota de débito de la retención,
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
            // Un comprobante de retención del procesador (uno o varios por mes) se registra por
            // su cuenta sobre las facturas que ampara (RetencionVentaSaveService.saveRetencionLote,
            // con_detall_retenc.ide_cccfa) y puede cubrir cobros de varios depósitos: cada ciclo
            // toma solo la porción de SUS facturas. Se contabiliza aquí (nota de débito + asiento)
            // una vez por comprobante, y la trazabilidad queda en tes_det_devol_cobro_tarjeta_ret.
            const retencionesCiclo = await this.consultas.getRetencionesPorFacturas(ideCccfaList, dtoIn);
            const retencionAplicada = await this.aplicarRetenciones(
                {
                    retenciones: retencionesCiclo,
                    contabilizar: true,
                    ideTecba: dtoIn.ideTecba,
                    ideGeper: dtoIn.ideGeper,
                    beneficiario: facturaComision.nom_geper ?? '',
                    fecha: dtoIn.fecha,
                },
                dtoIn,
                asientosGenerados,
            );
            const totalRetencionCents = retencionAplicada.ivaCents + retencionAplicada.rentaCents;

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
            const baseIdeTedtr = retencionAplicada.filas.length
                ? await this.dataSource.getSeqTable(
                    'tes_det_devol_cobro_tarjeta_ret', 'ide_tedtr', retencionAplicada.filas.length, dtoIn.login,
                )
                : 0;

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
                        ide_teincb: (comprobanteGuardado as any).ideTeincb ?? null,
                        ide_tecba_destino: dtoIn.ideTecbaDestino,
                        ide_teclb_pago_comision: pago.ide_teclb,
                        ide_teclb_retiro: transferencia.ide_teclb_retiro,
                        ide_teclb_ingreso: transferencia.ide_teclb_ingreso,
                        fecha_tecdt: dtoIn.fecha,
                        valor_total_cobros_tecdt: valorTotalCobros,
                        valor_comision_tecdt: centsToAmount(valorComisionTotalCents - valorIvaComisionCents),
                        valor_iva_comision_tecdt: valorIvaComision,
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
                ...this.filasRetencionCiclo(ideTecdt, baseIdeTedtr, retencionAplicada.filas, dtoIn.login),
            ];
            await this.core.save({ ...dtoIn, listQuery, audit: false });

            return {
                message: 'ok',
                ide_tecdt: ideTecdt,
                ide_cpcfa: ideCpcfa,
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

    /**
     * Aplica al ciclo las retenciones que ya amparan sus facturas y todavía no se contabilizaron
     * (caso real: el comprobante de Bendo llegó después de conciliar el depósito, o cubre cobros
     * de varios depósitos y cada ciclo toma su parte).
     *
     * `dtoIn.generarAsientoContable` es una decisión explícita del usuario (ver el DTO): si el
     * depósito que ya se transfirió NO tenía descontada la retención, hay que contabilizarla
     * recién ahora - misma nota de débito + asiento que el flujo normal (generarAsientoRetencionTarjeta:
     * DEBE Retención IVA/Renta por Cobrar, HABER Banco Tarjeta) y se descuenta de
     * valor_neto_calculado_tecdt. Si el depósito YA venía neto de la retención, generar ese asiento
     * duplicaría el descuento (la cuenta de tarjeta ya se redujo por esa diferencia al registrar la
     * transferencia real) - en ese caso solo queda la trazabilidad documental.
     */
    async adjuntarRetencion(ideTecdt: number, dtoIn: AdjuntarRetencionDevolucionTarjetaDto & HeaderParamsDto) {
        const cab = await this.consultas.getDevolucionTarjetaById(ideTecdt, dtoIn);
        if (!cab) {
            throw new BadRequestException(`La devolución de cobros con tarjeta ide_tecdt=${ideTecdt} no existe`);
        }
        if (cab.anulado_tecdt) {
            throw new BadRequestException('Este ciclo está anulado');
        }
        const pendientes = cab.retenciones_pendientes as Record<string, any>[];
        if (!pendientes.length) {
            throw new BadRequestException(
                'Ninguna factura de este ciclo tiene un comprobante de retención pendiente de aplicar. Registre primero el comprobante.',
            );
        }

        const asientosGenerados: number[] = [];
        try {
            const aplicada = await this.aplicarRetenciones(
                {
                    retenciones: pendientes,
                    contabilizar: dtoIn.generarAsientoContable,
                    ideTecba: cab.ide_tecba,
                    ideGeper: cab.ide_geper,
                    beneficiario: cab.proveedor ?? '',
                    fecha: getCurrentDate(),
                },
                dtoIn,
                asientosGenerados,
            );

            const baseIdeTedtr = await this.dataSource.getSeqTable(
                'tes_det_devol_cobro_tarjeta_ret', 'ide_tedtr', aplicada.filas.length, dtoIn.login,
            );
            const listQuery: ObjectQueryDto[] = this.filasRetencionCiclo(
                ideTecdt, baseIdeTedtr, aplicada.filas, dtoIn.login,
            );
            // El neto esperado solo baja cuando la retención se contabiliza ahora (nota de débito
            // + asiento); si el depósito ya venía neto, queda el valor con que se liquidó.
            if (dtoIn.generarAsientoContable) {
                listQuery.unshift({
                    operation: 'update',
                    module: 'tes',
                    tableName: 'cab_devol_cobro_tarjeta',
                    primaryKey: 'ide_tecdt',
                    object: {
                        ide_tecdt: ideTecdt,
                        valor_neto_calculado_tecdt: centsToAmount(
                            toCents(cab.valor_neto_calculado_tecdt) - aplicada.ivaCents - aplicada.rentaCents,
                        ),
                    },
                });
            }
            await this.core.save({ ...dtoIn, listQuery, audit: false });
        } catch (error) {
            for (const ideCnccc of asientosGenerados) {
                await this.asientosAutomaticosService.eliminarAsiento(ideCnccc, dtoIn);
            }
            throw error;
        }

        return { message: 'ok', ide_tecdt: ideTecdt, comprobantes: pendientes.length };
    }

    /**
     * Contabiliza (opcionalmente) la porción de cada comprobante de retención que corresponde a un
     * ciclo: por comprobante, una nota de débito sobre la cuenta de tarjeta + el asiento
     * (DEBE Retención IVA/Renta por Cobrar, HABER Banco Tarjeta) - mismo criterio que el flujo
     * normal de finalizar(). Con `contabilizar = false` solo devuelve los valores (respaldo
     * documental, sin movimiento). Los asientos generados se acumulan en `asientosGenerados` para
     * la compensación best-effort del llamador si algo falla después.
     */
    private async aplicarRetenciones(
        params: {
            retenciones: Record<string, any>[];
            contabilizar: boolean;
            ideTecba: number;
            ideGeper: number;
            beneficiario: string;
            fecha: string;
        },
        dtoIn: HeaderParamsDto,
        asientosGenerados: number[],
    ) {
        const ideTettbNotaDebito = Number(this.variables.get('p_tes_nota_debito'));
        const filas: { ide_cncre: number; ide_teclb: number | null; ivaCents: number; rentaCents: number }[] = [];

        for (const r of params.retenciones) {
            const ivaCents = toCents(r.valor_iva);
            const rentaCents = toCents(r.valor_renta);
            let ideTeclb: number | null = null;

            if (params.contabilizar && ivaCents + rentaCents > 0) {
                const observacion = `Retención SRI cobros con tarjeta N.${r.numero_cncre}`;
                const numeroDebito = await this.preLibroBancosSaveService.generarNumeroAutomatico(
                    params.ideTecba, ideTettbNotaDebito, dtoIn,
                );
                const movDebito = await this.preLibroBancosSaveService.generarLibroBancoOtros({
                    ...dtoIn,
                    ideTecba: params.ideTecba,
                    ideTettb: ideTettbNotaDebito,
                    valor: centsToAmount(ivaCents + rentaCents),
                    fecha: params.fecha,
                    numero: numeroDebito,
                    observacion,
                    beneficiario: params.beneficiario,
                });
                ideTeclb = movDebito.ide_teclb;

                const asiento = await this.asientosAutomaticosService.generarAsientoRetencionTarjeta({
                    ...dtoIn,
                    ideTeclb,
                    fecha: params.fecha,
                    ideTecba: params.ideTecba,
                    ideGeper: params.ideGeper,
                    valorRetencionIva: centsToAmount(ivaCents),
                    valorRetencionRenta: centsToAmount(rentaCents),
                    ideCncimIva: r.ide_cncim_iva ? Number(r.ide_cncim_iva) : null,
                    ideCncimRenta: r.ide_cncim_renta ? Number(r.ide_cncim_renta) : null,
                    observacion,
                });
                if (!asiento.generado) {
                    throw new BadRequestException(
                        `No se pudo generar el asiento de la retención N.${r.numero_cncre}: ${(asiento.advertencias ?? []).join('; ') || 'error desconocido'}`,
                    );
                }
                if (asiento.ide_cnccc) asientosGenerados.push(asiento.ide_cnccc);
            }
            filas.push({ ide_cncre: Number(r.ide_cncre), ide_teclb: ideTeclb, ivaCents, rentaCents });
        }

        return {
            filas,
            ivaCents: filas.reduce((sum, f) => sum + f.ivaCents, 0),
            rentaCents: filas.reduce((sum, f) => sum + f.rentaCents, 0),
        };
    }

    private filasRetencionCiclo(
        ideTecdt: number,
        baseIdeTedtr: number,
        filas: { ide_cncre: number; ide_teclb: number | null; ivaCents: number; rentaCents: number }[],
        login: string,
    ): ObjectQueryDto[] {
        return filas.map((f, i): ObjectQueryDto => ({
            operation: 'insert',
            module: 'tes',
            tableName: 'det_devol_cobro_tarjeta_ret',
            primaryKey: 'ide_tedtr',
            object: {
                ide_tedtr: baseIdeTedtr + i,
                ide_tecdt: ideTecdt,
                ide_cncre: f.ide_cncre,
                ide_teclb_debito_retencion: f.ide_teclb,
                usuario_ingre: login,
            },
        }));
    }

    /**
     * Anula un ciclo completo de Devolución de Cobros con Tarjeta, para permitir reingresarlo
     * desde cero (patrón "anular todo" de flete-consolidado). Reutiliza
     * PreLibroBancosSaveService.anularMovimiento (misma primitiva genérica que usa el resto de
     * Tesorería) sobre cada movimiento de libro banco generado por finalizar(): reversa su propio
     * asiento contable, elimina la aplicación de pago CxP/CxC asociada y el comprobante-banco
     * ligado, y recalcula pagado_cpcfa. El retiro y el ingreso de la transferencia comparten un
     * mismo asiento (ver generarTransferencia) - anularlo dos veces es inofensivo (solo
     * UPDATE/zeroing idempotentes), pero cada fila de tes_cab_libr_banc sí necesita su propia
     * llamada para quedar marcada anulada individualmente.
     *
     * La factura de comisión (cxp_cabece_factur) y la retención SRI (con_cabece_retenc) del
     * proveedor NO se anulan/eliminan: son documentos reales que el proveedor ya emitió. Solo se
     * revierte su PAGO (vía anularMovimiento sobre ide_teclb_pago_comision, que deja
     * pagado_cpcfa = false), para que al reingresar el proceso se pueda re-seleccionar/pagar la
     * MISMA factura sin tener que volver a cargar el XML. Del comprobante de retención solo se
     * revierte su contabilización en este ciclo (nota de débito + asiento por comprobante); el
     * comprobante sigue vinculado a las facturas.
     */
    async anular(ideTecdt: number, dtoIn: AnularDevolucionTarjetaDto & HeaderParamsDto) {
        const cab = await this.consultas.getDevolucionTarjetaById(ideTecdt, dtoIn);
        if (!cab) {
            throw new BadRequestException(`La devolución de cobros con tarjeta ide_tecdt=${ideTecdt} no existe`);
        }
        if (cab.anulado_tecdt) {
            throw new BadRequestException('Esta devolución de cobros con tarjeta ya se encuentra anulada');
        }

        // Orden: ingreso/retiro de la transferencia primero, luego el débito de cada retención
        // contabilizada (si hay), luego el pago de la comisión - cada movimiento es independiente.
        await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: cab.ide_teclb_ingreso });
        await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: cab.ide_teclb_retiro });
        for (const r of cab.retenciones as { ide_teclb_debito_retencion: number | null }[]) {
            if (r.ide_teclb_debito_retencion) {
                await this.preLibroBancosSaveService.anularMovimiento({
                    ...dtoIn,
                    ideTeclb: r.ide_teclb_debito_retencion,
                });
            }
        }
        await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: cab.ide_teclb_pago_comision });

        // Se libera la porción de retención aplicada a este ciclo. Los comprobantes NO se tocan ni
        // se desvinculan de las facturas: son documentos reales ya recibidos y valen igual para el
        // ATS - al reingresar el ciclo se vuelven a tomar solos de las facturas.
        await this.dataSource.pool.query(
            `DELETE FROM tes_det_devol_cobro_tarjeta_ret WHERE ide_tecdt = $1`,
            [ideTecdt],
        );

        // Libera las facturas de venta cubiertas para que vuelvan a aparecer como pendientes
        await this.dataSource.pool.query(
            `DELETE FROM tes_det_devol_cobro_tarjeta_fact WHERE ide_tecdt = $1`,
            [ideTecdt],
        );

        const listQuery: ObjectQueryDto[] = [{
            operation: 'update',
            module: 'tes',
            tableName: 'cab_devol_cobro_tarjeta',
            primaryKey: 'ide_tecdt',
            object: {
                ide_tecdt: ideTecdt,
                anulado_tecdt: true,
                fecha_anula_tecdt: toPgTimestampNow(),
                motivo_anula_tecdt: dtoIn.motivo ?? null,
                usuario_anula: dtoIn.login,
            },
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });

        return { message: 'ok', ide_tecdt: ideTecdt };
    }
}
