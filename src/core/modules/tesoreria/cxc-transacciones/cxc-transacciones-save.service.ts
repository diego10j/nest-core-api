import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { getCurrentTime } from 'src/util/helpers/date-util';

import { PreLibroBancosSaveService } from '../pre-libro-bancos/pre-libro-bancos-save.service';
import { PreLibroBancosService } from '../pre-libro-bancos/pre-libro-bancos.service';

import { CxcTransaccionesService } from './cxc-transacciones.service';
import { SaveCobroCxCDto } from './dto/save-cobro-cxc.dto';
import { SavePagoMultipleCxCDto } from './dto/save-pago-multiple-cxc.dto';

/** Tipo de transacción bancaria "cheque posfechado" CxC (legacy: ide_tettb === "13") */
const IDE_TETTB_CHEQUE_POSFECHADO_CXC = 13;

@Injectable()
export class CxcTransaccionesSaveService extends BaseService {
    private readonly logger = new Logger(CxcTransaccionesSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly cxcTransaccionesService: CxcTransaccionesService,
        private readonly preLibroBancosService: PreLibroBancosService,
        private readonly preLibroBancosSaveService: PreLibroBancosSaveService,
        private readonly asientosAutomaticosService: AsientosAutomaticosService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
                'p_cxc_tipo_trans_pago',
                'p_cxc_tipo_trans_cheque_posfechado',
                'p_cxc_tipo_trans_sobrepago',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    async saveCobroCxC(dtoIn: SaveCobroCxCDto & HeaderParamsDto) {
        // ─── PASO 1: VALIDACIONES ─────────────────────────────────────────────
        if (!dtoIn.ideCccfa || !dtoIn.fecha || !dtoIn.ideTecba || !dtoIn.ideTettb || !dtoIn.valor || !dtoIn.observacion) {
            throw new BadRequestException('Faltan campos requeridos: ideCccfa, fecha, ideTecba, ideTettb, valor, observacion');
        }

        if (dtoIn.valor <= 0) {
            throw new BadRequestException('El valor debe ser mayor a 0');
        }

        const esChequePostfechado = dtoIn.ideTettb === 13;
        if (esChequePostfechado) {
            if (!dtoIn.fechaEfectivo) {
                throw new BadRequestException('Cheque posfechado requiere fechaEfectivo');
            }
            if (!dtoIn.numCuentaCheque) {
                throw new BadRequestException('Cheque posfechado requiere numCuentaCheque');
            }
        }

        // ─── PASO 2: OBTENER FACTURA ─────────────────────────────────────────
        const factura = await this.cxcTransaccionesService.getFacturaCxC({
            ideCccfa: dtoIn.ideCccfa,
            ...dtoIn,
        } as any);

        const saldoAnterior = Number(factura.saldo_x_pagar);

        // ─── PASO 3: DETERMINAR TIPO TRANSACCION CxC ─────────────────────────
        let ideCcttr: number;
        if (esChequePostfechado) {
            ideCcttr = Number(this.variables.get('p_cxc_tipo_trans_cheque_posfechado'));
        } else {
            ideCcttr = Number(this.variables.get('p_cxc_tipo_trans_pago'));
        }

        const ideCcttrSobrePago = Number(this.variables.get('p_cxc_tipo_trans_sobrepago'));
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        // ─── PASO 4: OBTENER SECUENCIALES (FUERA DE TRANSACCIÓN) ────────────
        const ideTeclb = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );
        const ideCcdtr = await this.dataSource.getSeqTable(
            'cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login,
        );
        const numeroPago = await this.cxcTransaccionesService.getNumeroPagoFactura(factura.ide_ccctr);

        const tieneSobrepago = dtoIn.valor > saldoAnterior;
        const ideCcctrSaldoFavor = tieneSobrepago
            ? await this.dataSource.getSeqTable('cxc_cabece_transa', 'ide_ccctr', 1, dtoIn.login)
            : null;
        const ideCcdtrSaldo = tieneSobrepago
            ? await this.dataSource.getSeqTable('cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login)
            : null;

        // ─── PASO 5: CÁLCULOS DE NEGOCIO ─────────────────────────────────────
        const fechaVenci = esChequePostfechado ? (dtoIn.fechaEfectivo ?? dtoIn.fecha) : dtoIn.fecha;
        const documRelacion = dtoIn.numero ?? factura.secuencial_cccfa ?? '';

        const valorPagadoCxC = Math.min(dtoIn.valor, saldoAnterior);
        const esPagoParcial = dtoIn.valor < saldoAnterior;
        const observacionDetalle = (esPagoParcial
            ? `[ABONO] ${dtoIn.observacion}`
            : dtoIn.observacion
        ).substring(0, 180);

        const saldoRestanteCalculado = saldoAnterior - valorPagadoCxC;

        // ─── PASO 6: TRANSACCIÓN ÚNICA ───────────────────────────────────────
        const queryRunner = await this.dataSource.pool.connect();
        let pagadoTotal = false;
        let saldoFavorCreado = false;

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
                    dtoIn.numero ?? '000000', dtoIn.fecha, dtoIn.fecha, factura.nom_geper ?? '',
                    dtoIn.observacion, false, dtoIn.fechaEfectivo ?? dtoIn.fecha, dtoIn.numCuentaCheque ?? '',
                    dtoIn.ideTeban ?? null, false, false,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
            );

            await queryRunner.query(
                `INSERT INTO cxc_detall_transa (
                    ide_ccdtr, ide_teclb, ide_cccfa, ide_ccctr, ide_ccttr,
                    ide_usua, valor_ccdtr, observacion_ccdtr, numero_pago_ccdtr,
                    fecha_trans_ccdtr, fecha_venci_ccdtr, docum_relac_ccdtr,
                    ide_empr, ide_sucu, usuario_ingre, hora_ingre
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                [ideCcdtr, ideTeclb, dtoIn.ideCccfa, factura.ide_ccctr, ideCcttr,
                    dtoIn.ideUsua, valorPagadoCxC, observacionDetalle, numeroPago,
                    dtoIn.fecha, fechaVenci, documRelacion,
                    dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
            );

            await queryRunner.query(
                `UPDATE cxc_detall_transa SET ide_teclb = $1 WHERE ide_cccfa = $2 AND ide_teclb IS NULL`,
                [ideTeclb, dtoIn.ideCccfa],
            );

            if (saldoRestanteCalculado <= 0) {
                await queryRunner.query(
                    `UPDATE cxc_cabece_factura SET pagado_cccfa = true WHERE ide_cccfa = $1`,
                    [dtoIn.ideCccfa],
                );
                pagadoTotal = true;
            }

            if (tieneSobrepago && ideCcctrSaldoFavor != null && ideCcdtrSaldo != null) {
                const diferencia = dtoIn.valor - saldoAnterior;

                await queryRunner.query(
                    `INSERT INTO cxc_cabece_transa (
                        ide_ccctr, ide_geper, fecha_trans_ccctr, observacion_ccctr,
                        ide_empr, ide_sucu, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [ideCcctrSaldoFavor, factura.ide_geper, dtoIn.fecha,
                        'V/. SALDO A FAVOR PAGO ADICIONAL',
                        dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
                );

                await queryRunner.query(
                    `INSERT INTO cxc_detall_transa (
                        ide_ccdtr, ide_teclb, ide_ccctr, ide_ccttr, ide_usua,
                        valor_ccdtr, observacion_ccdtr, numero_pago_ccdtr,
                        fecha_trans_ccdtr, fecha_venci_ccdtr, docum_relac_ccdtr,
                        ide_empr, ide_sucu, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
                    [ideCcdtrSaldo, ideTeclb, ideCcctrSaldoFavor, ideCcttrSobrePago,
                        dtoIn.ideUsua, diferencia, 'V/. SALDO A FAVOR PAGO ADICIONAL',
                        1, dtoIn.fecha, dtoIn.fecha, documRelacion,
                        dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
                );
                saldoFavorCreado = true;
            }

            await queryRunner.query('COMMIT');
        } catch (error) {
            await queryRunner.query('ROLLBACK');
            throw error;
        } finally {
            await queryRunner.release();
        }

        // ─── PASO 7: ACTUALIZAR SECUENCIAL (FUERA DE TRANSACCIÓN) ────────────
        await this.preLibroBancosSaveService.actualizarSecuencial(
            dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.numero ?? '000000', dtoIn,
        );

        // ─── PASO 8: GENERAR ASIENTO CONTABLE (FUERA DE TRANSACCIÓN) ────────
        let asientoResult: any = { generado: false };
        try {
            asientoResult = await this.asientosAutomaticosService.generarAsientoCobroCxC({
                ideTeclb,
                fecha: dtoIn.fecha,
                ideTecba: dtoIn.ideTecba,
                ideTettb: dtoIn.ideTettb,
                ideGeper: factura.ide_geper,
                valor: dtoIn.valor,
                observacion: dtoIn.observacion,
                ...dtoIn,
            } as any);
        } catch (error) {
            this.logger.warn(`Error en asiento automatico para ide_teclb=${ideTeclb}: ${error}`);
        }

        // ─── PASO 9: RETORNAR RESULTADO ──────────────────────────────────────
        return {
            message: 'ok',
            ide_teclb: ideTeclb,
            ide_ccdtr: ideCcdtr,
            saldo_anterior: saldoAnterior,
            saldo_restante: saldoRestanteCalculado,
            pagado_total: pagadoTotal,
            saldo_favor_creado: saldoFavorCreado,
            ide_cccfa: dtoIn.ideCccfa,
            asiento_contable: asientoResult,
        };
    }

    /**
     * Registra un cobro a cliente con distribución entre una o varias
     * cuentas por cobrar (paridad cargarPagoCxC + generarTransaccionPago +
     * generarTransaccionPagoAdicionalCxC del legacy). Genera un único
     * movimiento en tes_cab_libr_banc y un detalle cxc_detall_transa por
     * documento cobrado, todo en una única transacción SQL. Complementa a
     * saveCobroCxC (que solo soporta una factura) sin modificarlo.
     */
    async savePagoMultipleCxC(dtoIn: SavePagoMultipleCxCDto & HeaderParamsDto) {
        // ─── PASO 1: VALIDACIONES ─────────────────────────────────────────────
        if (!dtoIn.facturas?.length) {
            throw new BadRequestException('Debe seleccionar al menos una cuenta por cobrar');
        }
        if (dtoIn.valor <= 0) {
            throw new BadRequestException('El valor a cobrar debe ser mayor a 0');
        }

        const sumaFacturas = Number(
            dtoIn.facturas.reduce((sum, f) => sum + Number(f.valor), 0).toFixed(2),
        );
        if (sumaFacturas > dtoIn.valor + 0.01) {
            throw new BadRequestException(
                `La suma de los documentos (${sumaFacturas}) no puede superar el valor del cobro (${dtoIn.valor})`,
            );
        }

        const esChequePostfechado = dtoIn.ideTettb === IDE_TETTB_CHEQUE_POSFECHADO_CXC;
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
        const ideCcctrList = dtoIn.facturas.map((f) => f.ide_ccctr);
        const infoTransacciones = await this.cxcTransaccionesService.getInfoTransacciones(ideCcctrList);
        const infoPorCcctr = new Map(infoTransacciones.map((info) => [Number(info.ide_ccctr), info]));

        let beneficiario = '';
        for (const f of dtoIn.facturas) {
            const info = infoPorCcctr.get(f.ide_ccctr);
            if (!info) {
                throw new BadRequestException(`La cuenta por cobrar ide_ccctr=${f.ide_ccctr} no existe`);
            }
            if (Number(info.ide_geper) !== dtoIn.ideGeper) {
                throw new BadRequestException(
                    `La cuenta por cobrar ide_ccctr=${f.ide_ccctr} no pertenece al cliente seleccionado`,
                );
            }
            const saldo = Number(info.saldo);
            if (Number(f.valor) > saldo + 0.01) {
                throw new BadRequestException(
                    `El valor aplicado a ${info.secuencial_cccfa ?? f.ide_ccctr} (${f.valor}) supera su saldo pendiente (${saldo})`,
                );
            }
            beneficiario = info.nom_geper ?? beneficiario;
        }

        // ─── PASO 3: TIPO DE TRANSACCIÓN Y ESTADOS ───────────────────────────
        const ideCcttr = esChequePostfechado
            ? Number(this.variables.get('p_cxc_tipo_trans_cheque_posfechado'))
            : Number(this.variables.get('p_cxc_tipo_trans_pago'));
        const ideCcttrSobrePago = Number(this.variables.get('p_cxc_tipo_trans_sobrepago'));
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const fechaVenceCuota = esChequePostfechado ? (dtoIn.fechaEfectivo ?? dtoIn.fecha) : dtoIn.fecha;

        // ─── PASO 4: SECUENCIALES (FUERA DE TRANSACCIÓN) ─────────────────────
        const ideTeclb = await this.dataSource.getSeqTable('tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login);
        const baseIdeCcdtr = await this.dataSource.getSeqTable(
            'cxc_detall_transa', 'ide_ccdtr', dtoIn.facturas.length, dtoIn.login,
        );
        const numerosPago = await Promise.all(
            dtoIn.facturas.map((f) => this.cxcTransaccionesService.getNumeroPagoFactura(f.ide_ccctr)),
        );

        const diferencia = Number((dtoIn.valor - sumaFacturas).toFixed(2));
        const tieneSaldoFavor = diferencia > 0.01;

        let ideCcctrSaldoFavor: number | null = null;
        let esNuevaCabeceraSaldoFavor = false;
        if (tieneSaldoFavor) {
            const cabeceraExistente = await this.cxcTransaccionesService.getCabeceraSaldoFavor(
                dtoIn.ideGeper, dtoIn,
            );
            if (cabeceraExistente) {
                ideCcctrSaldoFavor = Number(cabeceraExistente.ide_ccctr);
            } else {
                ideCcctrSaldoFavor = await this.dataSource.getSeqTable(
                    'cxc_cabece_transa', 'ide_ccctr', 1, dtoIn.login,
                );
                esNuevaCabeceraSaldoFavor = true;
            }
        }
        const ideCcdtrSaldoFavor = tieneSaldoFavor
            ? await this.dataSource.getSeqTable('cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login)
            : null;

        // ─── PASO 5: TRANSACCIÓN ÚNICA ────────────────────────────────────────
        const queryRunner = await this.dataSource.pool.connect();
        const detalleFacturas: Array<{
            ide_ccctr: number; ide_cccfa: number; valor: number;
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
                const info = infoPorCcctr.get(f.ide_ccctr);
                const ideCcdtr = baseIdeCcdtr + i;
                const saldoAnterior = Number(info?.saldo ?? 0);
                const saldoRestante = Number((saldoAnterior - f.valor).toFixed(2));
                const docRelacion = numero !== '000000' ? numero : (info?.secuencial_cccfa ?? '');

                await queryRunner.query(
                    `UPDATE cxc_detall_transa SET ide_teclb = $1 WHERE ide_cccfa = $2 AND ide_teclb IS NULL`,
                    [ideTeclb, f.ide_cccfa],
                );

                await queryRunner.query(
                    `INSERT INTO cxc_detall_transa (
                        ide_ccdtr, ide_teclb, ide_cccfa, ide_ccctr, ide_ccttr,
                        ide_usua, valor_ccdtr, observacion_ccdtr, numero_pago_ccdtr,
                        fecha_trans_ccdtr, fecha_venci_ccdtr, docum_relac_ccdtr,
                        ide_empr, ide_sucu, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                    [ideCcdtr, ideTeclb, f.ide_cccfa, f.ide_ccctr, ideCcttr,
                        dtoIn.ideUsua, f.valor, dtoIn.observacion, numerosPago[i],
                        dtoIn.fecha, fechaVenceCuota, docRelacion,
                        dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
                );

                const pagadoTotal = saldoRestante <= 0.01;
                if (pagadoTotal) {
                    await queryRunner.query(
                        `UPDATE cxc_cabece_factura SET pagado_cccfa = true WHERE ide_cccfa = $1`,
                        [f.ide_cccfa],
                    );
                }

                detalleFacturas.push({
                    ide_ccctr: f.ide_ccctr, ide_cccfa: f.ide_cccfa, valor: f.valor,
                    saldo_anterior: saldoAnterior, saldo_restante: saldoRestante, pagado_total: pagadoTotal,
                });
            }

            if (tieneSaldoFavor && ideCcctrSaldoFavor != null && ideCcdtrSaldoFavor != null) {
                if (esNuevaCabeceraSaldoFavor) {
                    await queryRunner.query(
                        `INSERT INTO cxc_cabece_transa (
                            ide_ccctr, ide_geper, fecha_trans_ccctr, observacion_ccctr,
                            ide_empr, ide_sucu, usuario_ingre, hora_ingre
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [ideCcctrSaldoFavor, dtoIn.ideGeper, dtoIn.fecha,
                            'V/. SALDO A FAVOR PAGO ADICIONAL',
                            dtoIn.ideEmpr, dtoIn.ideSucu, dtoIn.login, getCurrentTime()],
                    );
                }

                await queryRunner.query(
                    `INSERT INTO cxc_detall_transa (
                        ide_ccdtr, ide_teclb, ide_ccctr, ide_ccttr, ide_usua,
                        valor_ccdtr, observacion_ccdtr, numero_pago_ccdtr,
                        fecha_trans_ccdtr, fecha_venci_ccdtr, docum_relac_ccdtr,
                        ide_empr, ide_sucu, usuario_ingre, hora_ingre
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
                    [ideCcdtrSaldoFavor, ideTeclb, ideCcctrSaldoFavor, ideCcttrSobrePago,
                        dtoIn.ideUsua, diferencia, 'V/. SALDO A FAVOR PAGO ADICIONAL',
                        1, dtoIn.fecha, dtoIn.fecha, numero,
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
        let asientoResult: Awaited<ReturnType<AsientosAutomaticosService['generarAsientoCobroCxC']>> = {
            generado: false, banco_encontrado: false, cliente_encontrado: false, advertencias: [],
        };
        try {
            asientoResult = await this.asientosAutomaticosService.generarAsientoCobroCxC({
                ideTeclb, fecha: dtoIn.fecha, ideTecba: dtoIn.ideTecba, ideTettb: dtoIn.ideTettb,
                ideGeper: dtoIn.ideGeper, valor: dtoIn.valor, observacion: dtoIn.observacion,
                ...dtoIn,
            });
        } catch (error) {
            this.logger.warn(`Error en asiento automatico de cobro CxC para ide_teclb=${ideTeclb}: ${error}`);
        }

        return {
            message: 'ok',
            ide_teclb: ideTeclb,
            ide_geper: dtoIn.ideGeper,
            valor_cobrado: dtoIn.valor,
            facturas: detalleFacturas,
            saldo_favor_creado: tieneSaldoFavor,
            valor_saldo_favor: tieneSaldoFavor ? diferencia : 0,
            asiento_contable: asientoResult,
        };
    }
}
