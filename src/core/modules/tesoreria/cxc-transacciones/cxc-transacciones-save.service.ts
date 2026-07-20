import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';
import { getCurrentTime } from 'src/util/helpers/date-util';

import { PreLibroBancosSaveService } from '../pre-libro-bancos/pre-libro-bancos-save.service';

import { CxcTransaccionesService } from './cxc-transacciones.service';
import { SaveCobroCxCDto } from './dto/save-cobro-cxc.dto';

@Injectable()
export class CxcTransaccionesSaveService extends BaseService {
    private readonly logger = new Logger(CxcTransaccionesSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly cxcTransaccionesService: CxcTransaccionesService,
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
}
