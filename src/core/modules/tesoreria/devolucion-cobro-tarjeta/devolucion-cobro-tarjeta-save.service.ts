import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { ComprobanteBancoSaveService } from 'src/core/modules/tesoreria/comprobante-banco/comprobante-banco-save.service';
import { PreLibroBancosSaveService } from 'src/core/modules/tesoreria/pre-libro-bancos/pre-libro-bancos-save.service';
import { toPgTimestampNow } from 'src/util/helpers/date-util';

import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';
import { AnularDevolucionTarjetaDto } from './dto/anular-devolucion-tarjeta.dto';
import { RegistrarAcreditacionTarjetaDto } from './dto/registrar-acreditacion-tarjeta.dto';

/**
 * Aritmética monetaria en centavos enteros: JS no representa exactamente todos los decimales
 * en binario (ej. 0.1 + 0.2 === 0.30000000000000004), así que se suma/resta en centavos y solo
 * se vuelve a dólares para persistir/mostrar/comparar.
 */
const toCents = (value: number | string | null | undefined): number => Math.round(Number(value || 0) * 100);
const centsToAmount = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * Registro de una ACREDITACIÓN de un procesador de tarjeta (ej. Bendo): la transferencia del neto
 * de uno o varios pagos (facturas de venta cobradas con tarjeta) a la cuenta bancaria real.
 *
 * Solo mueve el neto: la cuenta de tarjeta baja por lo transferido y la comisión y la retención
 * quedan pendientes en ella hasta que se registren los cortes del procesador (CorteTarjetaSaveService),
 * que llegan días después y en cualquier orden. Del Excel de liquidación se guardan, por pago, los
 * valores que el procesador aplicó (comisión, IVA de comisión, retención IVA/renta) para conciliar
 * después contra esos documentos.
 *
 * Nota sobre atomicidad: cada paso (transferir, guardar comprobante) usa su propio mecanismo
 * transaccional interno (igual que el resto de Tesorería), pero no existe una transacción SQL
 * única que envuelva TODOS los pasos. Ante un fallo se revierten los asientos ya generados
 * (compensación best-effort) y se relanza el error.
 */
@Injectable()
export class DevolucionCobroTarjetaSaveService extends BaseService {
    private readonly logger = new Logger(DevolucionCobroTarjetaSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: DevolucionCobroTarjetaService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly comprobanteBancoSaveService: ComprobanteBancoSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
    ) {
        super();
    }

    async registrarAcreditacion(dtoIn: RegistrarAcreditacionTarjetaDto & HeaderParamsDto) {
        // ─── PASO 1: VALIDACIONES ─────────────────────────────────────────────
        if (!dtoIn.facturas?.length) {
            throw new BadRequestException('Debe seleccionar al menos un pago cobrado con tarjeta');
        }
        if (!dtoIn.comprobante?.fotoTeincb) {
            throw new BadRequestException('Debe cargar el comprobante de la transferencia bancaria');
        }

        const ideCccfaList = dtoIn.facturas.map((f) => f.ide_cccfa);
        if (new Set(ideCccfaList).size !== ideCccfaList.length) {
            throw new BadRequestException('Hay pagos repetidos en la selección');
        }

        // Una liquidación del procesador es UNA transferencia: no se mezclan varias en un registro
        // ni se registra dos veces la misma
        const numerosLiquidacion = [...new Set(dtoIn.facturas.map((f) => f.numeroLiquidacion).filter(Boolean))] as string[];
        if (numerosLiquidacion.length > 1) {
            throw new BadRequestException(
                `Los pagos pertenecen a ${numerosLiquidacion.length} liquidaciones distintas (${numerosLiquidacion.join(', ')}): cada liquidación es una transferencia y se registra por separado.`,
            );
        }
        const yaRegistradas = await this.consultas.getLiquidacionesRegistradas(numerosLiquidacion, dtoIn);
        if (yaRegistradas.length) {
            throw new BadRequestException(
                `La liquidación ${yaRegistradas[0].numero} ya está registrada en la acreditación #${yaRegistradas[0].ide_tecdt}.`,
            );
        }
        const infoFacturas = await this.consultas.getInfoFacturasCobradasTarjeta(ideCccfaList, dtoIn.ideTecba, dtoIn);
        const infoPorCccfa = new Map(infoFacturas.map((info) => [Number(info.ide_cccfa), info]));

        // Neto por pago = bruto - comisión - IVA comisión - retención: lo que el procesador debió
        // acreditar por ese pago. Su suma es el neto CALCULADO, contra el que se compara lo
        // realmente transferido (comprobante).
        let valorTotalCobrosCents = 0;
        let netoCalculadoCents = 0;
        for (const f of dtoIn.facturas) {
            const info = infoPorCccfa.get(f.ide_cccfa);
            if (!info) {
                throw new BadRequestException(
                    `La factura ide_cccfa=${f.ide_cccfa} no corresponde a un cobro registrado con la cuenta de tarjeta seleccionada`,
                );
            }
            if (info.ya_cubierta) {
                throw new BadRequestException(`La factura N.${info.secuencial_cccfa} ya tiene su acreditación registrada`);
            }
            const brutoCents = toCents(f.valor);
            // El valor bruto debe ser lo realmente cobrado con tarjeta: no se confía en el cliente
            if (Math.abs(brutoCents - toCents(info.valor_cobrado_tarjeta)) > 1) {
                throw new BadRequestException(
                    `El valor de la factura N.${info.secuencial_cccfa} (${f.valor.toFixed(2)}) no coincide con lo cobrado con tarjeta (${Number(info.valor_cobrado_tarjeta).toFixed(2)})`,
                );
            }
            const netoCents = brutoCents
                - toCents(f.comision) - toCents(f.ivaComision) - toCents(f.retIva) - toCents(f.retRenta);
            if (netoCents < 0) {
                throw new BadRequestException(
                    `Los descuentos del pago N.${info.secuencial_cccfa} superan su valor cobrado`,
                );
            }
            valorTotalCobrosCents += brutoCents;
            netoCalculadoCents += netoCents;
        }

        const advertencias: string[] = [];
        const diferenciaCents = toCents(dtoIn.comprobante.valorTeincb) - netoCalculadoCents;
        if (Math.abs(diferenciaCents) > 1) {
            advertencias.push(
                `El valor transferido (${dtoIn.comprobante.valorTeincb.toFixed(2)}) difiere del neto según la liquidación (${centsToAmount(netoCalculadoCents).toFixed(2)}). Diferencia: ${centsToAmount(diferenciaCents).toFixed(2)}.`,
            );
        }

        // Mismo número de documento bancario ya usado en otra acreditación vigente a la misma cuenta
        // destino: aviso, no bloqueo (los bancos reutilizan secuencias entre fechas)
        if (dtoIn.comprobante.numComprobanteTeincb) {
            const qDoc = new SelectQuery(`
                SELECT c.ide_tecdt
                FROM tes_cab_devol_cobro_tarjeta c
                INNER JOIN tes_info_comprobante_banco ti ON ti.ide_teincb = c.ide_teincb
                WHERE c.anulado_tecdt = FALSE
                  AND c.ide_tecba_destino = $1
                  AND ti.num_comprobante_teincb = $2
                  AND ti.fecha_teincb = $3::date
                LIMIT 1
            `);
            qDoc.addIntParam(1, dtoIn.ideTecbaDestino);
            qDoc.addStringParam(2, dtoIn.comprobante.numComprobanteTeincb);
            qDoc.addParam(3, dtoIn.comprobante.fechaTeincb ?? dtoIn.fecha);
            const repetido = await this.dataSource.createSingleQuery(qDoc);
            if (repetido) {
                advertencias.push(
                    `El documento bancario N.${dtoIn.comprobante.numComprobanteTeincb} de esa fecha ya se usó en la acreditación #${repetido.ide_tecdt}. Verifique que no sea un registro duplicado.`,
                );
            }
        }

        const asientosGenerados: number[] = [];
        try {
            // ─── PASO 2: TRANSFERENCIA DEL NETO A LA CUENTA DESTINO ───────────────
            // Se transfiere el valor REALMENTE depositado según el comprobante (fuente de verdad
            // del movimiento bancario); la diferencia, si la hay, ya quedó como advertencia.
            // generarTransferencia genera su propio asiento (cuenta destino DEBE / cuenta de
            // tarjeta HABER). El comprobante se guarda aparte (paso 3) ligado al movimiento de
            // INGRESO con tipo 'recibida': es la prueba de que el banco RECIBIÓ el depósito.
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

            // ─── PASO 3: PERSISTIR EL COMPROBANTE DE TRANSFERENCIA ────────────────
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

            // ─── PASO 4: CABECERA + PAGOS CUBIERTOS ───────────────────────────────
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
                        ide_teincb: (comprobanteGuardado as any).ideTeincb ?? null,
                        ide_tecba_destino: dtoIn.ideTecbaDestino,
                        ide_teclb_retiro: transferencia.ide_teclb_retiro,
                        ide_teclb_ingreso: transferencia.ide_teclb_ingreso,
                        fecha_tecdt: dtoIn.fecha,
                        valor_total_cobros_tecdt: centsToAmount(valorTotalCobrosCents),
                        valor_neto_calculado_tecdt: centsToAmount(netoCalculadoCents),
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
                        valor_comision_tedtf: f.comision ?? null,
                        valor_iva_comision_tedtf: f.ivaComision ?? null,
                        valor_ret_iva_tedtf: f.retIva ?? null,
                        valor_ret_renta_tedtf: f.retRenta ?? null,
                        numero_liquidacion_tedtf: f.numeroLiquidacion ?? null,
                        usuario_ingre: dtoIn.login,
                    },
                })),
            ];
            await this.core.save({ ...dtoIn, listQuery, audit: false });

            return {
                message: 'ok',
                ide_tecdt: ideTecdt,
                valor_neto_calculado: centsToAmount(netoCalculadoCents),
                valor_neto_transferido: dtoIn.comprobante.valorTeincb,
                advertencias,
            };
        } catch (error) {
            // Compensación best-effort: revierte los asientos contables ya generados. Los
            // movimientos de tesorería (transferencia) NO se revierten automáticamente; quedan
            // visibles en Tesorería para anulación manual si el proceso no llegó a completarse.
            for (const ideCnccc of asientosGenerados) {
                await this.asientosAutomaticosService.eliminarAsiento(ideCnccc, dtoIn);
            }
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Error al registrar la acreditación de cobros con tarjeta: ${error}`);
            throw error;
        }
    }

    /**
     * Anula una acreditación (o un ciclo anterior con comisión y retención incluidas) para permitir
     * reingresarla. Reutiliza PreLibroBancosSaveService.anularMovimiento sobre cada movimiento de
     * libro banco del ciclo: reversa su asiento, elimina la aplicación de pago asociada y el
     * comprobante-banco ligado. El retiro y el ingreso de la transferencia comparten asiento;
     * anularlo dos veces es inofensivo, pero cada fila necesita su propia llamada.
     *
     * Solo los ciclos anteriores al modelo por cortes traen pago de comisión y notas de débito de
     * retención propios; la factura de comisión y el comprobante de retención NO se anulan (son
     * documentos reales del proveedor): solo se revierte su pago/contabilización en el ciclo.
     */
    async anular(ideTecdt: number, dtoIn: AnularDevolucionTarjetaDto & HeaderParamsDto) {
        const cab = await this.consultas.getDevolucionTarjetaById(ideTecdt, dtoIn);
        if (!cab) {
            throw new BadRequestException(`La devolución de cobros con tarjeta ide_tecdt=${ideTecdt} no existe`);
        }
        if (cab.anulado_tecdt) {
            throw new BadRequestException('Esta devolución de cobros con tarjeta ya se encuentra anulada');
        }

        // anularMovimiento elimina el comprobante-banco ligado al ingreso (foto + datos OCR/IA),
        // y la cabecera lo referencia por FK (ide_teincb): se libera antes para no bloquear la
        // anulación. Idempotente si el proceso se reintenta tras un fallo a medias.
        await this.dataSource.pool.query(
            `UPDATE tes_cab_devol_cobro_tarjeta SET ide_teincb = NULL WHERE ide_tecdt = $1`,
            [ideTecdt],
        );

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
        if (cab.ide_teclb_pago_comision) {
            await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: cab.ide_teclb_pago_comision });
        }

        // Libera los vínculos de retención de ciclos anteriores y los pagos cubiertos para que
        // vuelvan a aparecer como pendientes de acreditar
        await this.dataSource.pool.query(
            `DELETE FROM tes_det_devol_cobro_tarjeta_ret WHERE ide_tecdt = $1`,
            [ideTecdt],
        );
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
