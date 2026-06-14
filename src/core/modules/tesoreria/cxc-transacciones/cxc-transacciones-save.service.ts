import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
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

        const factura = await this.cxcTransaccionesService.getFacturaCxC({
            ideCccfa: dtoIn.ideCccfa,
            ...dtoIn,
        } as any);

        const saldoAnterior = Number(factura.saldo_x_pagar);

        // ─── PASO 2: DETERMINAR TIPO TRANSACCION CxC ─────────────────────────
        let ideCcttr: number;
        if (esChequePostfechado) {
            ideCcttr = Number(this.variables.get('p_cxc_tipo_trans_cheque_posfechado'));
        } else {
            ideCcttr = Number(this.variables.get('p_cxc_tipo_trans_pago'));
        }

        const ideCcttrSobrePago = Number(this.variables.get('p_cxc_tipo_trans_sobrepago'));

        // ─── PASO 3: GENERAR LIBRO BANCO ─────────────────────────────────────
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const ideTeclb = await this.dataSource.getSeqTable(
            'tes_cab_libr_banc', 'ide_teclb', 1, dtoIn.login,
        );

        const listQuery: ObjectQueryDto[] = [];

        // 3a. INSERT en tes_cab_libr_banc
        const libroBancoObject: Record<string, unknown> = {
            ide_teclb: ideTeclb,
            ide_teelb: ideTeelb,
            ide_tecba: dtoIn.ideTecba,
            ide_tettb: dtoIn.ideTettb,
            valor_teclb: dtoIn.valor,
            numero_teclb: dtoIn.numero ?? '000000',
            fecha_trans_teclb: dtoIn.fecha,
            fecha_venci_teclb: dtoIn.fecha,
            beneficiari_teclb: factura.nom_geper ?? '',
            observacion_teclb: dtoIn.observacion,
            conciliado_teclb: false,
            fec_cam_est_teclb: dtoIn.fechaEfectivo ?? dtoIn.fecha,
            num_comprobante_teclb: dtoIn.numCuentaCheque ?? '',
            ide_teban: dtoIn.ideTeban ?? null,
            depositado_teclb: false,
            devuelto_teclb: false,
            hora_ingre: getCurrentTime(),
        };

        listQuery.push({
            operation: 'insert',
            module: 'tes',
            tableName: 'cab_libr_banc',
            primaryKey: 'ide_teclb',
            object: libroBancoObject,
        });

        // ─── PASO 4: GENERAR TRANSACCION CxC DETALLE ─────────────────────────
        const numeroPago = await this.cxcTransaccionesService.getNumeroPagoFactura(factura.ide_ccctr);
        const ideCcdtr = await this.dataSource.getSeqTable(
            'cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login,
        );

        const fechaVenci = esChequePostfechado ? (dtoIn.fechaEfectivo ?? dtoIn.fecha) : dtoIn.fecha;
        const documRelacion = dtoIn.numero ?? factura.secuencial_cccfa ?? '';

        const valorPagadoCxC = Math.min(dtoIn.valor, saldoAnterior);
        const esPagoParcial = dtoIn.valor < saldoAnterior;
        const observacionDetalle = (esPagoParcial
            ? `[ABONO] ${dtoIn.observacion}`
            : dtoIn.observacion
        ).substring(0, 180);

        const detalleObject: Record<string, unknown> = {
            ide_ccdtr: ideCcdtr,
            ide_teclb: ideTeclb,
            ide_cccfa: dtoIn.ideCccfa,
            ide_ccctr: factura.ide_ccctr,
            ide_ccttr: ideCcttr,
            ide_usua: dtoIn.ideUsua,
            valor_ccdtr: valorPagadoCxC,
            observacion_ccdtr: observacionDetalle,
            numero_pago_ccdtr: numeroPago,
            fecha_trans_ccdtr: dtoIn.fecha,
            fecha_venci_ccdtr: fechaVenci,
            docum_relac_ccdtr: documRelacion,
            hora_ingre: getCurrentTime(),
        };

        listQuery.push({
            operation: 'insert',
            module: 'cxc',
            tableName: 'detall_transa',
            primaryKey: 'ide_ccdtr',
            object: detalleObject,
        });

        // Ejecutar inserts del libro banco y detalle CxC
        await this.core.save({ ...dtoIn, listQuery, audit: false });

        // Actualizar secuencial
        await this.preLibroBancosSaveService.actualizarSecuencial(
            dtoIn.ideTecba, dtoIn.ideTettb, dtoIn.numero ?? '000000', dtoIn,
        );

        // ─── PASO 5: ACTUALIZAR VINCULO EN cxc_detall_transa ──────────────────
        await this.dataSource.pool.query(
            `UPDATE cxc_detall_transa SET ide_teclb = $1 WHERE ide_cccfa = $2 AND ide_teclb IS NULL`,
            [ideTeclb, dtoIn.ideCccfa],
        );

        // ─── PASO 6: RECALCULAR SALDO Y MARCAR PAGO ──────────────────────────
        const saldoRestante = await this.cxcTransaccionesService.getSaldoActual(factura.ide_ccctr);
        let pagadoTotal = false;
        let saldoFavorCreado = false;

        if (saldoRestante <= 0) {
            await this.dataSource.pool.query(
                `UPDATE cxc_cabece_factura SET pagado_cccfa = true WHERE ide_cccfa = $1`,
                [dtoIn.ideCccfa],
            );
            pagadoTotal = true;
        }

        // ─── PASO 7: SOBREPAGO - SALDO A FAVOR ────────────────────────────────
        if (dtoIn.valor > saldoAnterior) {
            const diferencia = dtoIn.valor - saldoAnterior;

            const ideCcctrSaldoFavor = await this.dataSource.getSeqTable(
                'cxc_cabece_transa', 'ide_ccctr', 1, dtoIn.login,
            );

            const cabeceraObject: Record<string, unknown> = {
                ide_ccctr: ideCcctrSaldoFavor,
                ide_geper: factura.ide_geper,
                fecha_trans_ccctr: dtoIn.fecha,
                observacion_ccctr: 'V/. SALDO A FAVOR PAGO ADICIONAL',
                hora_ingre: getCurrentTime(),
            };

            const cabeceraListQuery: ObjectQueryDto[] = [{
                operation: 'insert',
                module: 'cxc',
                tableName: 'cabece_transa',
                primaryKey: 'ide_ccctr',
                object: cabeceraObject,
            }];

            await this.core.save({ ...dtoIn, listQuery: cabeceraListQuery, audit: false });

            const ideCcdtrSaldo = await this.dataSource.getSeqTable(
                'cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login,
            );

            const saldoFavorObject: Record<string, unknown> = {
                ide_ccdtr: ideCcdtrSaldo,
                ide_teclb: ideTeclb,
                ide_ccctr: ideCcctrSaldoFavor,
                ide_ccttr: ideCcttrSobrePago,
                ide_usua: dtoIn.ideUsua,
                valor_ccdtr: diferencia,
                observacion_ccdtr: 'V/. SALDO A FAVOR PAGO ADICIONAL',
                numero_pago_ccdtr: 1,
                fecha_trans_ccdtr: dtoIn.fecha,
                fecha_venci_ccdtr: dtoIn.fecha,
                docum_relac_ccdtr: documRelacion,
                hora_ingre: getCurrentTime(),
            };

            const saldoFavorListQuery: ObjectQueryDto[] = [{
                operation: 'insert',
                module: 'cxc',
                tableName: 'detall_transa',
                primaryKey: 'ide_ccdtr',
                object: saldoFavorObject,
            }];

            await this.core.save({ ...dtoIn, listQuery: saldoFavorListQuery, audit: false });
            saldoFavorCreado = true;
        }

        // ─── PASO 8: GENERAR ASIENTO CONTABLE AUTOMATICO ─────────────────────
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
            saldo_restante: saldoRestante,
            pagado_total: pagadoTotal,
            saldo_favor_creado: saldoFavorCreado,
            ide_cccfa: dtoIn.ideCccfa,
            asiento_contable: asientoResult,
        };
    }
}
