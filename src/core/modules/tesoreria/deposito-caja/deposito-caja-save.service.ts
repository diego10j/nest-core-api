import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { ComprobanteBancoSaveService } from 'src/core/modules/tesoreria/comprobante-banco/comprobante-banco-save.service';
import { PreLibroBancosSaveService } from 'src/core/modules/tesoreria/pre-libro-bancos/pre-libro-bancos-save.service';
import { getCurrentTime, toPgTimestampNow } from 'src/util/helpers/date-util';

import { DepositoCajaService } from './deposito-caja.service';
import { AnularDepositoCajaDto } from './dto/anular-deposito-caja.dto';
import { CompletarDepositoCajaDto } from './dto/completar-deposito-caja.dto';
import { GenerarDepositoCajaDto } from './dto/generar-deposito-caja.dto';

/**
 * Aritmética monetaria en centavos enteros - mismo criterio documentado en
 * devolucion-cobro-tarjeta-save.service.ts (JS no representa exactamente todos los decimales en
 * binario, así que sumar valores en punto flotante puede arrastrar centavos de diferencia).
 */
const toCents = (value: number | string | null | undefined): number => Math.round(Number(value || 0) * 100);
const centsToAmount = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * Orquesta el Depósito de Caja en 2 ETAPAS SEPARADAS EN EL TIEMPO (a diferencia de Devolución
 * Cobros Tarjeta, que finaliza todo en una sola llamada): el comprobante del depósito físicamente
 * no existe hasta después de ir al banco.
 *
 * 1. generar(): el usuario elige la caja, el banco destino y qué movimientos de ingreso
 *    pendientes va a llevar a depositar - solo RESERVA esos movimientos (quedan excluidos de la
 *    lista de pendientes de cualquier otro depósito vía DepositoCajaService.getMovimientosPendientes).
 *    Todavía no se toca tes_cab_libr_banc ni se genera asiento.
 * 2. completar(): sobre un depósito ya generado, cuando el usuario ya hizo el depósito físico y
 *    tiene fecha/número/imagen del comprobante - genera el retiro de caja + el ingreso a banco +
 *    el asiento contable (AsientosAutomaticosService.generarAsientoTransferencia, HABER caja /
 *    DEBE banco), y marca los movimientos cubiertos depositado_teclb=true.
 *
 * anular() libera los movimientos reservados en cualquiera de las 2 etapas; si ya estaba
 * completado, además reversa los movimientos y el asiento (reutilizando
 * PreLibroBancosSaveService.anularMovimiento, la misma primitiva genérica que usa el resto de
 * Tesorería y Devolución Cobros Tarjeta).
 */
@Injectable()
export class DepositoCajaSaveService extends BaseService {
    private readonly logger = new Logger(DepositoCajaSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: DepositoCajaService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly comprobanteBancoSaveService: ComprobanteBancoSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
                'p_tes_tran_transferencia_menos',
                'p_tes_tran_deposito',
                'p_con_beneficiario_empresa',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    async generar(dtoIn: GenerarDepositoCajaDto & HeaderParamsDto) {
        if (dtoIn.ideTecbaOrigen === dtoIn.ideTecbaDestino) {
            throw new BadRequestException('La cuenta origen (caja) y la cuenta destino (banco) no pueden ser la misma.');
        }
        if (!dtoIn.movimientos?.length) {
            throw new BadRequestException('Debe seleccionar al menos un movimiento de ingreso de caja para depositar');
        }

        const esCaja = await this.consultas.esCuentaCaja(dtoIn.ideTecbaOrigen, dtoIn);
        if (!esCaja) {
            throw new BadRequestException('La cuenta origen seleccionada no es una caja');
        }
        const esBanco = await this.consultas.esCuentaBanco(dtoIn.ideTecbaDestino, dtoIn);
        if (!esBanco) {
            throw new BadRequestException('La cuenta destino seleccionada no es un banco');
        }

        const ideTeclbList = dtoIn.movimientos.map((m) => m.ide_teclb);
        const info = await this.consultas.getInfoMovimientosPendientes(ideTeclbList, dtoIn.ideTecbaOrigen, dtoIn);
        const infoPorTeclb = new Map(info.map((row) => [Number(row.ide_teclb), row]));

        for (const m of dtoIn.movimientos) {
            const row = infoPorTeclb.get(m.ide_teclb);
            if (!row) {
                throw new BadRequestException(
                    `El movimiento ide_teclb=${m.ide_teclb} no corresponde a un ingreso de la caja seleccionada`,
                );
            }
            if (row.depositado_teclb) {
                throw new BadRequestException(`El movimiento N.${row.ide_teclb} ya fue depositado`);
            }
            if (row.ya_reservado) {
                throw new BadRequestException(`El movimiento N.${row.ide_teclb} ya está reservado por otro depósito`);
            }
        }

        const valorCents = dtoIn.movimientos.reduce((sum, m) => sum + toCents(m.valor), 0);
        const valor = centsToAmount(valorCents);

        const ideTedca = await this.dataSource.getSeqTable('tes_cab_deposito_caja', 'ide_tedca', 1, dtoIn.login);
        const baseIdeTedcm = await this.dataSource.getSeqTable(
            'tes_det_deposito_caja_mov', 'ide_tedcm', dtoIn.movimientos.length, dtoIn.login,
        );

        const listQuery: ObjectQueryDto[] = [
            {
                operation: 'insert',
                module: 'tes',
                tableName: 'cab_deposito_caja',
                primaryKey: 'ide_tedca',
                object: {
                    ide_tedca: ideTedca,
                    ide_empr: dtoIn.ideEmpr,
                    ide_sucu: dtoIn.ideSucu,
                    ide_tecba_origen: dtoIn.ideTecbaOrigen,
                    ide_tecba_destino: dtoIn.ideTecbaDestino,
                    valor_tedca: valor,
                    observacion_tedca: dtoIn.observacion ?? null,
                    usuario_ingre: dtoIn.login,
                },
            },
            ...dtoIn.movimientos.map((m, i): ObjectQueryDto => ({
                operation: 'insert',
                module: 'tes',
                tableName: 'det_deposito_caja_mov',
                primaryKey: 'ide_tedcm',
                object: {
                    ide_tedcm: baseIdeTedcm + i,
                    ide_tedca: ideTedca,
                    ide_teclb: m.ide_teclb,
                    valor_tedcm: m.valor,
                    usuario_ingre: dtoIn.login,
                },
            })),
        ];
        await this.core.save({ ...dtoIn, listQuery, audit: false });

        return { message: 'ok', ide_tedca: ideTedca, valor_tedca: valor };
    }

    async completar(ideTedca: number, dtoIn: CompletarDepositoCajaDto & HeaderParamsDto) {
        const cab = await this.consultas.getDepositoCajaById(ideTedca, dtoIn);
        if (!cab) {
            throw new BadRequestException(`El depósito de caja ide_tedca=${ideTedca} no existe`);
        }
        if (cab.anulado_tedca) {
            throw new BadRequestException('Este depósito de caja ya se encuentra anulado');
        }
        if (cab.completado_tedca) {
            throw new BadRequestException('Este depósito de caja ya se encuentra completado');
        }

        const valor = Number(cab.valor_tedca);
        const diferenciaCents = toCents(dtoIn.comprobante.valorTeincb) - toCents(valor);
        const advertencias: string[] = [];
        if (Math.abs(diferenciaCents) > 1) {
            advertencias.push(
                `El valor del comprobante (${dtoIn.comprobante.valorTeincb.toFixed(2)}) difiere del valor generado (${valor.toFixed(2)}). Diferencia: ${centsToAmount(diferenciaCents).toFixed(2)}.`,
            );
        }

        let ideCnccc: number | undefined;
        try {
            const asientoResult = await this.asientosAutomaticosService.generarAsientoTransferencia({
                ...dtoIn,
                fecha: dtoIn.fecha,
                ideTecbaOrigen: cab.ide_tecba_origen,
                ideTecbaDestino: cab.ide_tecba_destino,
                valor,
                observacion: cab.observacion_tedca ?? 'DEPÓSITO DE CAJA',
            });
            if (!asientoResult.generado) {
                throw new BadRequestException(
                    `No se pudo generar el asiento contable del depósito (${(asientoResult.advertencias ?? []).join('; ')}). Verifique que ambas cuentas tengan una cuenta contable configurada.`,
                );
            }
            ideCnccc = asientoResult.ide_cnccc as number;

            const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
            const ideTettbMenos = Number(this.variables.get('p_tes_tran_transferencia_menos'));
            const ideTettbDeposito = Number(this.variables.get('p_tes_tran_deposito'));
            const ideBenef = Number(this.variables.get('p_con_beneficiario_empresa'));

            const persQuery = await this.dataSource.pool.query(
                `SELECT nom_geper FROM gen_persona WHERE ide_geper = $1 LIMIT 1`,
                [ideBenef],
            );
            const beneficiario = persQuery.rows[0]?.nom_geper ?? '';

            const ideRetiro = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
            const ideIngreso = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);

            const listQuery: ObjectQueryDto[] = [
                // Retiro de caja
                {
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'cab_libr_banc',
                    primaryKey: 'ide_teclb',
                    object: {
                        ide_teclb: ideRetiro,
                        ide_teelb: ideTeelb,
                        ide_tecba: cab.ide_tecba_origen,
                        ide_tettb: ideTettbMenos,
                        ide_cnccc: ideCnccc,
                        valor_teclb: valor,
                        numero_teclb: dtoIn.numero ?? '000000',
                        fecha_trans_teclb: dtoIn.fecha,
                        fecha_venci_teclb: dtoIn.fecha,
                        beneficiari_teclb: beneficiario,
                        observacion_teclb: cab.observacion_tedca ?? 'DEPÓSITO DE CAJA',
                        conciliado_teclb: false,
                        depositado_teclb: false,
                        devuelto_teclb: false,
                        hora_ingre: getCurrentTime(),
                    },
                },
                // Ingreso a banco
                {
                    operation: 'insert',
                    module: 'tes',
                    tableName: 'cab_libr_banc',
                    primaryKey: 'ide_teclb',
                    object: {
                        ide_teclb: ideIngreso,
                        ide_teelb: ideTeelb,
                        ide_tecba: cab.ide_tecba_destino,
                        ide_tettb: ideTettbDeposito,
                        ide_cnccc: ideCnccc,
                        valor_teclb: valor,
                        numero_teclb: dtoIn.numero ?? '000000',
                        fecha_trans_teclb: dtoIn.fecha,
                        fecha_venci_teclb: dtoIn.fecha,
                        beneficiari_teclb: beneficiario,
                        observacion_teclb: cab.observacion_tedca ?? 'DEPÓSITO DE CAJA',
                        conciliado_teclb: false,
                        depositado_teclb: false,
                        devuelto_teclb: false,
                        hora_ingre: getCurrentTime(),
                    },
                },
            ];
            await this.core.save({ ...dtoIn, listQuery, audit: false });

            // Marca los movimientos de caja cubiertos como depositados y los vincula al retiro/
            // ingreso generados - alimenta el drill-down ya existente en
            // PreLibroBancosService (WHERE tes_ide_teclb=$1 OR tes_ide_teclb1=$1) y hace que
            // anularMovimiento(ideRetiro) los desmarque automáticamente (ver PASO 2 de
            // anularMovimiento: UPDATE ... WHERE tes_ide_teclb = $1).
            const ideTeclbCubiertos = ((cab as any).movimientos ?? []).map((m: any) => Number(m.ide_teclb));
            await this.dataSource.pool.query(
                `UPDATE tes_cab_libr_banc
                 SET tes_ide_teclb = $1, tes_ide_teclb1 = $2, depositado_teclb = true
                 WHERE ide_teclb = ANY($3)`,
                [ideRetiro, ideIngreso, ideTeclbCubiertos],
            );

            const comprobanteGuardado = await this.comprobanteBancoSaveService.saveComprobante({
                ...dtoIn,
                ideTeclb: ideRetiro,
                fotoTeincb: dtoIn.comprobante.fotoTeincb,
                tipoTrnsTeincb: 'enviada',
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

            await this.core.save({
                ...dtoIn,
                listQuery: [{
                    operation: 'update',
                    module: 'tes',
                    tableName: 'cab_deposito_caja',
                    primaryKey: 'ide_tedca',
                    object: {
                        ide_tedca: ideTedca,
                        ide_teclb_retiro: ideRetiro,
                        ide_teclb_ingreso: ideIngreso,
                        ide_teincb: (comprobanteGuardado as any).ideTeincb ?? null,
                        fecha_tedca: dtoIn.fecha,
                        numero_tedca: dtoIn.numero ?? null,
                        completado_tedca: true,
                        fecha_completa_tedca: toPgTimestampNow(),
                        usuario_actua: dtoIn.login,
                    },
                }],
                audit: false,
            });

            return {
                message: 'ok',
                ide_tedca: ideTedca,
                ide_teclb_retiro: ideRetiro,
                ide_teclb_ingreso: ideIngreso,
                ide_cnccc: ideCnccc,
                advertencias,
            };
        } catch (error) {
            // Compensación best-effort: si el asiento ya se generó pero un paso posterior falló,
            // revertirlo para no dejar un asiento automático huérfano (mismo criterio que
            // devolucion-cobro-tarjeta-save.service.ts y generarTransferencia).
            if (ideCnccc) {
                await this.asientosAutomaticosService.eliminarAsiento(ideCnccc, dtoIn);
            }
            if (error instanceof BadRequestException) throw error;
            this.logger.error(`Error al completar depósito de caja ide_tedca=${ideTedca}: ${error}`);
            throw error;
        }
    }

    /**
     * Anula un Depósito de Caja: si estaba completado, reversa los movimientos y su asiento
     * (misma primitiva genérica que anular Devolución Cobros Tarjeta); en cualquier etapa,
     * libera los movimientos reservados/cubiertos para que reaparezcan como pendientes.
     */
    async anular(ideTedca: number, dtoIn: AnularDepositoCajaDto & HeaderParamsDto) {
        const cab = await this.consultas.getDepositoCajaById(ideTedca, dtoIn);
        if (!cab) {
            throw new BadRequestException(`El depósito de caja ide_tedca=${ideTedca} no existe`);
        }
        if (cab.anulado_tedca) {
            throw new BadRequestException('Este depósito de caja ya se encuentra anulado');
        }

        if (cab.completado_tedca) {
            await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: cab.ide_teclb_ingreso });
            await this.preLibroBancosSaveService.anularMovimiento({ ...dtoIn, ideTeclb: cab.ide_teclb_retiro });

            const ideTeclbCubiertos = ((cab as any).movimientos ?? []).map((m: any) => Number(m.ide_teclb));
            await this.dataSource.pool.query(
                `UPDATE tes_cab_libr_banc
                 SET depositado_teclb = false, tes_ide_teclb = NULL, tes_ide_teclb1 = NULL
                 WHERE ide_teclb = ANY($1)`,
                [ideTeclbCubiertos],
            );
        }

        // Libera los movimientos reservados/cubiertos para que vuelvan a aparecer como
        // pendientes, sin importar la etapa (Generado o Completado) en que estaba el depósito.
        await this.dataSource.pool.query(
            `DELETE FROM tes_det_deposito_caja_mov WHERE ide_tedca = $1`,
            [ideTedca],
        );

        const listQuery: ObjectQueryDto[] = [{
            operation: 'update',
            module: 'tes',
            tableName: 'cab_deposito_caja',
            primaryKey: 'ide_tedca',
            object: {
                ide_tedca: ideTedca,
                anulado_tedca: true,
                fecha_anula_tedca: toPgTimestampNow(),
                motivo_anula_tedca: dtoIn.motivo ?? null,
                usuario_anula: dtoIn.login,
            },
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });

        return { message: 'ok', ide_tedca: ideTedca };
    }
}
