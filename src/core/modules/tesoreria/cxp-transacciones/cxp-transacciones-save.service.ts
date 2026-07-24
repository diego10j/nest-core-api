import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import {
    AsientoPagoResult,
    AsientosAutomaticosService,
} from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { getCurrentTime } from 'src/util/helpers/date-util';

import { PreLibroBancosSaveService } from '../pre-libro-bancos/pre-libro-bancos-save.service';
import { PreLibroBancosService } from '../pre-libro-bancos/pre-libro-bancos.service';

import { CxpTransaccionesService } from './cxp-transacciones.service';
import { SaveAnticipoCxPDto } from './dto/save-anticipo-cxp.dto';
import { SavePagoCxPDto } from './dto/save-pago-cxp.dto';

/** Tipo de transacción CxP "pago cheque posfechado" (hardcoded en el legacy) */
const IDE_CPTTR_CHEQUE_POSFECHADO = 19;
/** Tipo de transacción bancaria "cheque posfechado" (legacy: ide_tettb === "14") */
const IDE_TETTB_CHEQUE_POSFECHADO = 14;

@Injectable()
export class CxpTransaccionesSaveService extends BaseService {
    private readonly logger = new Logger(CxpTransaccionesSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly cxpTransaccionesService: CxpTransaccionesService,
        private readonly preLibroBancosService: PreLibroBancosService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
                'p_cxp_tipo_trans_pago',
                'p_cxp_tipo_trans_anticipo',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Registra un pago a proveedor con distribución entre una o varias
     * cuentas por pagar (paridad cargarPagoCxP + generarTransaccionPago +
     * generarTransaccionPagoAdicionalCxP del legacy). Genera un único
     * movimiento en tes_cab_libr_banc y un detalle cxp_detall_transa por
     * documento pagado, todo en una única transacción SQL.
     */
    async savePagoCxP(dtoIn: SavePagoCxPDto & HeaderParamsDto) {
        // ─── PASO 1: VALIDACIONES ─────────────────────────────────────────────
        if (!dtoIn.facturas?.length) {
            throw new BadRequestException('Debe seleccionar al menos una cuenta por pagar');
        }
        if (dtoIn.valor <= 0) {
            throw new BadRequestException('El valor a pagar debe ser mayor a 0');
        }

        const sumaFacturas = Number(
            dtoIn.facturas.reduce((sum, f) => sum + Number(f.valor), 0).toFixed(2),
        );
        if (sumaFacturas > dtoIn.valor + 0.01) {
            throw new BadRequestException(
                `La suma de los documentos (${sumaFacturas}) no puede superar el valor del pago (${dtoIn.valor})`,
            );
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

        const numero = dtoIn.numero ?? '000000';
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

        // ─── PASO 2: INFORMACIÓN DE LAS CUENTAS SELECCIONADAS ────────────────
        const ideCpctrList = dtoIn.facturas.map((f) => f.ide_cpctr);
        const infoTransacciones = await this.cxpTransaccionesService.getInfoTransacciones(ideCpctrList);
        const infoPorCpctr = new Map(infoTransacciones.map((info) => [Number(info.ide_cpctr), info]));

        let beneficiario = '';
        for (const f of dtoIn.facturas) {
            const info = infoPorCpctr.get(f.ide_cpctr);
            if (!info) {
                throw new BadRequestException(`La cuenta por pagar ide_cpctr=${f.ide_cpctr} no existe`);
            }
            if (Number(info.ide_geper) !== dtoIn.ideGeper) {
                throw new BadRequestException(
                    `La cuenta por pagar ide_cpctr=${f.ide_cpctr} no pertenece al proveedor seleccionado`,
                );
            }
            const saldo = Number(info.saldo);
            if (Number(f.valor) > saldo + 0.01) {
                throw new BadRequestException(
                    `El valor aplicado a ${info.numero_cpcfa ?? f.ide_cpctr} (${f.valor}) supera su saldo pendiente (${saldo})`,
                );
            }
            beneficiario = info.nom_geper ?? beneficiario;
        }

        // ─── PASO 3: TIPO DE TRANSACCIÓN Y ESTADOS ───────────────────────────
        const ideCpttr = esChequePostfechado
            ? IDE_CPTTR_CHEQUE_POSFECHADO
            : Number(this.variables.get('p_cxp_tipo_trans_pago'));
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const fechaVenceCuota = esChequePostfechado ? (dtoIn.fechaEfectivo ?? dtoIn.fecha) : dtoIn.fecha;

        // ─── PASO 4: SECUENCIALES (FUERA DE TRANSACCIÓN) ─────────────────────
        const ideTeclb = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
        const baseIdeCpdtr = await this.dataSource.getSeqTable(
            'cxp_detall_transa', 'ide_cpdtr', dtoIn.facturas.length, dtoIn.login,
        );
        const numerosPago = await Promise.all(
            dtoIn.facturas.map((f) => this.cxpTransaccionesService.getNumeroPagoDocumento(f.ide_cpctr)),
        );

        const diferencia = Number((dtoIn.valor - sumaFacturas).toFixed(2));
        const tieneSaldoFavor = diferencia > 0.01;

        let ideCpctrSaldoFavor: number | null = null;
        let esNuevaCabeceraSaldoFavor = false;
        if (tieneSaldoFavor) {
            const cabeceraExistente = await this.cxpTransaccionesService.getCabeceraPagoAdicional(
                dtoIn.ideGeper, dtoIn,
            );
            if (cabeceraExistente) {
                ideCpctrSaldoFavor = Number(cabeceraExistente.ide_cpctr);
            } else {
                ideCpctrSaldoFavor = await this.dataSource.getSeqTable(
                    'cxp_cabece_transa', 'ide_cpctr', 1, dtoIn.login,
                );
                esNuevaCabeceraSaldoFavor = true;
            }
        }
        const ideCpdtrSaldoFavor = tieneSaldoFavor
            ? await this.dataSource.getSeqTable('cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login)
            : null;

        // ─── PASO 5: TRANSACCIÓN ÚNICA ────────────────────────────────────────
        const queryRunner = await this.dataSource.pool.connect();
        const detalleFacturas: Array<{
            ide_cpctr: number; ide_cpcfa: number; valor: number;
            saldo_anterior: number; saldo_restante: number; pagado_total: boolean;
        }> = [];

        try {
            await queryRunner.query('BEGIN');

            await queryRunner.query(
                `INSERT INTO tes_cab_libr_banc (
                    ide_teclb, ide_teelb, ide_tecba, ide_tettb, valor_teclb,
                    numero_teclb, fecha_trans_teclb, fecha_venci_teclb, beneficiari_teclb,
                    observacion_teclb, conciliado_teclb, fec_cam_est_teclb, num_comprobante_teclb,
                    ide_teban, depositado_teclb, devuelto_teclb,
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
                [ideTeclb, ideTeelb, dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.valor,
                    numero, dtoIn.fecha, dtoIn.fecha, beneficiario,
                    dtoIn.observacion, false, dtoIn.fechaEfectivo ?? dtoIn.fecha, dtoIn.numCuentaCheque ?? '',
                    dtoIn.ideTeban ?? null, false, false,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
            );

            for (let i = 0; i < dtoIn.facturas.length; i += 1) {
                const f = dtoIn.facturas[i];
                const info = infoPorCpctr.get(f.ide_cpctr);
                const ideCpdtr = baseIdeCpdtr + i;
                const saldoAnterior = Number(info?.saldo ?? 0);
                const saldoRestante = Number((saldoAnterior - f.valor).toFixed(2));
                const docRelacion = numero !== '000000' ? numero : (info?.numero_cpcfa ?? '');

                await queryRunner.query(
                    `UPDATE cxp_detall_transa SET ide_teclb = $1 WHERE ide_cpcfa = $2 AND ide_teclb IS NULL`,
                    [ideTeclb, f.ide_cpcfa],
                );

                await queryRunner.query(
                    `INSERT INTO cxp_detall_transa (
                        ide_cpdtr, ide_teclb, ide_cpcfa, ide_cpctr, ide_cpttr,
                        ide_usua, valor_cpdtr, observacion_cpdtr, numero_pago_cpdtr,
                        fecha_trans_cpdtr, fecha_venci_cpdtr, docum_relac_cpdtr, valor_anticipo_cpdtr,
                        ide_empr, ide_sucu, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
                    [ideCpdtr, ideTeclb, f.ide_cpcfa, f.ide_cpctr, ideCpttr,
                        dtoIn.ideUsua, f.valor, dtoIn.observacion, numerosPago[i],
                        dtoIn.fecha, fechaVenceCuota, docRelacion, 0,
                        dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
                );

                const pagadoTotal = saldoRestante <= 0.01;
                if (pagadoTotal) {
                    await queryRunner.query(
                        `UPDATE cxp_cabece_factur SET pagado_cpcfa = true WHERE ide_cpcfa = $1`,
                        [f.ide_cpcfa],
                    );
                }

                detalleFacturas.push({
                    ide_cpctr: f.ide_cpctr, ide_cpcfa: f.ide_cpcfa, valor: f.valor,
                    saldo_anterior: saldoAnterior, saldo_restante: saldoRestante, pagado_total: pagadoTotal,
                });
            }

            if (tieneSaldoFavor && ideCpctrSaldoFavor != null && ideCpdtrSaldoFavor != null) {
                if (esNuevaCabeceraSaldoFavor) {
                    await queryRunner.query(
                        `INSERT INTO cxp_cabece_transa (
                            ide_cpctr, ide_geper, ide_cpttr, fecha_trans_cpctr, observacion_cpctr,
                            ide_empr, ide_sucu, usuario_ingre, hora_ingre
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [ideCpctrSaldoFavor, dtoIn.ideGeper, Number(this.variables.get('p_cxp_tipo_trans_pago')),
                            dtoIn.fecha, 'V/. SALDO A FAVOR PAGO ADICIONAL',
                            dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
                    );
                }

                await queryRunner.query(
                    `INSERT INTO cxp_detall_transa (
                        ide_cpdtr, ide_teclb, ide_cpctr, ide_cpttr, ide_usua,
                        valor_cpdtr, observacion_cpdtr, numero_pago_cpdtr,
                        fecha_trans_cpdtr, fecha_venci_cpdtr, docum_relac_cpdtr, valor_anticipo_cpdtr,
                        ide_empr, ide_sucu, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                    [ideCpdtrSaldoFavor, ideTeclb, ideCpctrSaldoFavor, ideCpttr, dtoIn.ideUsua,
                        diferencia, 'V/. SALDO A FAVOR PAGO ADICIONAL', 1,
                        dtoIn.fecha, fechaVenceCuota, numero, 0,
                        dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
                );
            }

            await queryRunner.query('COMMIT');
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            throw error;
        } finally {
            queryRunner.release();
        }

        // ─── PASO 6: ACTUALIZAR SECUENCIAL (FUERA DE TRANSACCIÓN) ────────────
        await this.preLibroBancosSaveService.actualizarSecuencial(dtoIn.ideTecba, dtoIn.ideTettb, numero, dtoIn);

        // ─── PASO 7: ASIENTO CONTABLE (BEST-EFFORT, FUERA DE TRANSACCIÓN) ────
        let asientoResult: AsientoPagoResult = { generado: false, banco_encontrado: false, proveedor_encontrado: false, advertencias: [] };
        try {
            asientoResult = await this.asientosAutomaticosService.generarAsientoPagoCxP({
                ideTeclb, fecha: dtoIn.fecha, ideTecba: dtoIn.ideTecba, ideTettb: dtoIn.ideTettb,
                ideGeper: dtoIn.ideGeper, valor: dtoIn.valor, observacion: dtoIn.observacion,
                ...dtoIn,
            });
        } catch (error) {
            this.logger.warn(`Error en asiento automatico de pago CxP para ide_teclb=${ideTeclb}: ${error}`);
        }

        return {
            message: 'ok',
            ide_teclb: ideTeclb,
            ide_geper: dtoIn.ideGeper,
            valor_pagado: dtoIn.valor,
            facturas: detalleFacturas,
            saldo_favor_creado: tieneSaldoFavor,
            valor_saldo_favor: tieneSaldoFavor ? diferencia : 0,
            asiento_contable: asientoResult,
        };
    }

    /**
     * Registra un anticipo a proveedor: pago sin documento asociado (paridad
     * generarTransaccionAnticipo del legacy). Crea una cabecera cxp_cabece_transa
     * nueva (ide_cpcfa = NULL) que queda disponible como saldo a favor para
     * aplicarse a una factura futura.
     */
    async saveAnticipoCxP(dtoIn: SaveAnticipoCxPDto & HeaderParamsDto) {
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

        const numero = dtoIn.numero ?? '000000';
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

        const ideCpttrAnticipo = Number(this.variables.get('p_cxp_tipo_trans_anticipo'));
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const fechaVenceCuota = esChequePostfechado ? (dtoIn.fechaEfectivo ?? dtoIn.fecha) : dtoIn.fecha;

        const ideTeclb = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
        const ideCpctr = await this.dataSource.getSeqTable('cxp_cabece_transa', 'ide_cpctr', 1, dtoIn.login);
        const ideCpdtr = await this.dataSource.getSeqTable('cxp_detall_transa', 'ide_cpdtr', 1, dtoIn.login);

        const queryRunner = await this.dataSource.pool.connect();
        try {
            await queryRunner.query('BEGIN');

            await queryRunner.query(
                `INSERT INTO tes_cab_libr_banc (
                    ide_teclb, ide_teelb, ide_tecba, ide_tettb, valor_teclb,
                    numero_teclb, fecha_trans_teclb, fecha_venci_teclb, beneficiari_teclb,
                    observacion_teclb, conciliado_teclb, fec_cam_est_teclb, num_comprobante_teclb,
                    ide_teban, depositado_teclb, devuelto_teclb,
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
                [ideTeclb, ideTeelb, dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.valor,
                    numero, dtoIn.fecha, dtoIn.fecha, '',
                    dtoIn.observacion, false, dtoIn.fechaEfectivo ?? dtoIn.fecha, dtoIn.numCuentaCheque ?? '',
                    dtoIn.ideTeban ?? null, false, false,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
            );

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
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                [ideCpdtr, ideTeclb, ideCpctr, ideCpttrAnticipo, dtoIn.ideUsua,
                    dtoIn.valor, dtoIn.observacion, 0,
                    dtoIn.fecha, fechaVenceCuota, numero, 0,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
            );

            await queryRunner.query('COMMIT');
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            throw error;
        } finally {
            queryRunner.release();
        }

        await this.preLibroBancosSaveService.actualizarSecuencial(dtoIn.ideTecba, dtoIn.ideTettb, numero, dtoIn);

        let asientoResult: AsientoPagoResult = { generado: false, banco_encontrado: false, proveedor_encontrado: false, advertencias: [] };
        try {
            asientoResult = await this.asientosAutomaticosService.generarAsientoPagoCxP({
                ideTeclb, fecha: dtoIn.fecha, ideTecba: dtoIn.ideTecba, ideTettb: dtoIn.ideTettb,
                ideGeper: dtoIn.ideGeper, valor: dtoIn.valor, observacion: dtoIn.observacion,
                ...dtoIn,
            });
        } catch (error) {
            this.logger.warn(`Error en asiento automatico de anticipo CxP para ide_teclb=${ideTeclb}: ${error}`);
        }

        return {
            message: 'ok',
            ide_teclb: ideTeclb,
            ide_cpctr: ideCpctr,
            ide_geper: dtoIn.ideGeper,
            valor: dtoIn.valor,
            asiento_contable: asientoResult,
        };
    }
}
