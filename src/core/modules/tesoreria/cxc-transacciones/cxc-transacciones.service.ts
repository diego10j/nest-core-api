import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetFacturaCxCDto } from './dto/get-factura-cxc.dto';
import { GetFacturasPendientesClienteDto } from './dto/get-facturas-pendientes-cliente.dto';
import { GetTiposTransaccionPositivoDto } from './dto/get-tipos-transaccion-positivo.dto';

/** Tipo de transacción bancaria "cheque posfechado" CxC (legacy: ide_tettb === 13) - mismo
 * criterio hardcodeado que CxcTransaccionesSaveService.IDE_TETTB_CHEQUE_POSFECHADO_CXC. */
const IDE_TETTB_CHEQUE_POSFECHADO_CXC = 13;

@Injectable()
export class CxcTransaccionesService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxc_tipo_trans_pago',
                'p_cxc_tipo_trans_cheque_posfechado',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    async getFacturaCxC(dtoIn: GetFacturaCxCDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cf.ide_cccfa,
                cf.ide_geper,
                p.nom_geper,
                p.identificac_geper,
                cf.secuencial_cccfa,
                cf.total_cccfa,
                cf.fecha_emisi_cccfa,
                cf.dias_credito_cccfa,
                COALESCE(cf.observacion_cccfa, ct.observacion_ccctr) AS observacion_cccfa,
                ct.ide_ccctr,
                COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) AS saldo_x_pagar,
                cf.pagado_cccfa
            FROM cxc_cabece_factura cf
            JOIN cxc_cabece_transa ct ON ct.ide_cccfa = cf.ide_cccfa
            LEFT JOIN cxc_detall_transa dt ON dt.ide_ccctr = ct.ide_ccctr
            LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            WHERE cf.ide_cccfa = $1
              AND cf.ide_empr = $2
              AND cf.ide_sucu = $3
            GROUP BY cf.ide_cccfa, p.nom_geper, p.identificac_geper, ct.ide_ccctr
        `);
        query.addIntParam(1, dtoIn.ideCccfa);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        const factura = await this.dataSource.createSingleQuery(query);

        if (!factura) {
            throw new NotFoundException('Factura no encontrada');
        }

        if (Number(factura.saldo_x_pagar) <= 0) {
            return {
                error: false,
                message: 'La factura no tiene saldo pendiente',
            }

        }

        if (factura.pagado_cccfa) {
            return {
                error: false,
                message: 'La factura ya ha sido pagada completamente',
            }

        }

        return factura;
    }

    async getTiposTransaccionPositivo(dtoIn: GetTiposTransaccionPositivoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT ide_tettb, nombre_tettb
            FROM tes_tip_tran_banc
            WHERE signo_tettb = 1 AND ide_empr = $1
            ORDER BY nombre_tettb
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createQuery(query, 'tes_tip_tran_banc');
    }

    async getNumeroPagoFactura(ideCcctr: number) {
        const query = new SelectQuery(`
            SELECT COALESCE(MAX(numero_pago_ccdtr), 0) + 1 AS numero_pago
            FROM cxc_detall_transa
            WHERE ide_ccctr = $1
        `);
        query.addIntParam(1, ideCcctr);
        const result = await this.dataSource.createSingleQuery(query);
        return result?.numero_pago ?? 1;
    }

    async getSaldoActual(ideCcctr: number) {
        const query = new SelectQuery(`
            SELECT COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) AS saldo
            FROM cxc_detall_transa dt
            JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            WHERE dt.ide_ccctr = $1
        `);
        query.addIntParam(1, ideCcctr);
        const result = await this.dataSource.createSingleQuery(query);
        return Number(result?.saldo ?? 0);
    }

    /**
     * Cuentas por cobrar del cliente con saldo pendiente (selección múltiple
     * para distribuir un cobro). Paridad ServicioCliente.getSqlCuentasPorCobrar.
     */
    async getFacturasPendientesCliente(dtoIn: GetFacturasPendientesClienteDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT ct.ide_ccctr,
                   cf.ide_cccfa,
                   cf.secuencial_cccfa,
                   COALESCE(cf.fecha_emisi_cccfa, ct.fecha_trans_ccctr) AS fecha,
                   cf.total_cccfa,
                   cf.dias_credito_cccfa,
                   SUM(dt.valor_ccdtr * tt.signo_ccttr) AS saldo_x_pagar,
                   COALESCE(cf.observacion_cccfa, ct.observacion_ccctr) AS observacion
            FROM cxc_detall_transa dt
            INNER JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
            LEFT JOIN cxc_cabece_factura cf ON cf.ide_cccfa = ct.ide_cccfa
            LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            WHERE ct.ide_geper = $1
              AND ct.ide_sucu = $2
            GROUP BY ct.ide_ccctr, cf.ide_cccfa, cf.secuencial_cccfa,
                     cf.fecha_emisi_cccfa, ct.fecha_trans_ccctr, cf.total_cccfa,
                     cf.dias_credito_cccfa, cf.observacion_cccfa, ct.observacion_ccctr
            HAVING SUM(dt.valor_ccdtr * tt.signo_ccttr) > 0
            ORDER BY fecha ASC, ct.ide_ccctr ASC
        `);
        query.addIntParam(1, dtoIn.ideGeper);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Información batch (saldo, secuencial, cliente) de un conjunto de
     * cuentas por cobrar seleccionadas para distribuir un cobro.
     */
    async getInfoTransacciones(ideCcctrList: number[]) {
        const query = new SelectQuery(`
            SELECT ct.ide_ccctr,
                   cf.ide_cccfa,
                   cf.secuencial_cccfa,
                   ct.ide_geper,
                   p.nom_geper,
                   COALESCE(SUM(dt.valor_ccdtr * tt.signo_ccttr), 0) AS saldo
            FROM cxc_cabece_transa ct
            LEFT JOIN cxc_cabece_factura cf ON cf.ide_cccfa = ct.ide_cccfa
            LEFT JOIN cxc_detall_transa dt ON dt.ide_ccctr = ct.ide_ccctr
            LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            LEFT JOIN gen_persona p ON p.ide_geper = ct.ide_geper
            WHERE ct.ide_ccctr = ANY($1)
            GROUP BY ct.ide_ccctr, cf.ide_cccfa, cf.secuencial_cccfa, ct.ide_geper, p.nom_geper
        `);
        query.addParam(1, ideCcctrList);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Cabecera de "saldo a favor" reutilizable del cliente (sobrepago sin
     * documento asociado), paridad generarTransaccionPagoAdicionalCxC.
     */
    async getCabeceraSaldoFavor(ideGeper: number, dtoIn: HeaderParamsDto) {
        const tipoTransPago = Number(this.variables.get('p_cxc_tipo_trans_pago'));
        const query = new SelectQuery(`
            SELECT ide_ccctr
            FROM cxc_cabece_transa
            WHERE ide_ccttr = $1
              AND ide_cccfa IS NULL
              AND ide_geper = $2
              AND ide_sucu = $3
            LIMIT 1
        `);
        query.addIntParam(1, tipoTransPago);
        query.addIntParam(2, ideGeper);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Reporte "Cheques Diferidos por Cobrar": cheques posfechados de clientes en un rango de
     * fechas con sus 3 fechas relevantes - entrega (fecha_trans_teclb), efectiva/vencimiento
     * (fec_cam_est_teclb) y depósito real (fecha_tedca del Depósito de Caja que lo cubrió, si
     * ya se completó) - y su estado (Pendiente/Vencido/En depósito/Depositado/Devuelto).
     * Enlaza con Depósito de Caja vía tes_det_deposito_caja_mov (FK única por ide_teclb).
     */
    async getChequesDiferidosPorCobrar(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                a.ide_teclb,
                a.numero_teclb AS numero_comprobante,
                a.num_comprobante_teclb AS num_cuenta_cheque,
                a.fecha_trans_teclb AS fecha_entrega,
                a.fec_cam_est_teclb AS fecha_efectiva,
                a.valor_teclb AS valor,
                a.beneficiari_teclb AS cliente,
                a.observacion_teclb AS observacion,
                cb.nombre_tecba AS caja,
                tb.nombre_teban AS banco_cheque,
                a.depositado_teclb,
                a.devuelto_teclb,
                dc.ide_tedca,
                dc.completado_tedca,
                dc.fecha_tedca AS fecha_deposito_real,
                dc.numero_tedca AS numero_deposito,
                CASE
                    WHEN a.devuelto_teclb THEN 'Devuelto'
                    WHEN dc.completado_tedca THEN 'Depositado'
                    WHEN dc.ide_tedca IS NOT NULL THEN 'En depósito'
                    WHEN a.fec_cam_est_teclb < CURRENT_DATE THEN 'Vencido'
                    ELSE 'Pendiente'
                END AS estado,
                CASE
                    WHEN a.devuelto_teclb THEN 'error'
                    WHEN dc.completado_tedca THEN 'success'
                    WHEN dc.ide_tedca IS NOT NULL THEN 'info'
                    WHEN a.fec_cam_est_teclb < CURRENT_DATE THEN 'warning'
                    ELSE 'default'
                END AS color_estado
            FROM tes_cab_libr_banc a
            INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = a.ide_tecba
            LEFT JOIN tes_banco tb ON tb.ide_teban = a.ide_teban
            LEFT JOIN tes_det_deposito_caja_mov ddm ON ddm.ide_teclb = a.ide_teclb
            LEFT JOIN tes_cab_deposito_caja dc ON dc.ide_tedca = ddm.ide_tedca
            WHERE a.ide_tettb = ${IDE_TETTB_CHEQUE_POSFECHADO_CXC}
              AND a.ide_empr = $1
              AND a.ide_sucu = $2
              AND a.fecha_trans_teclb BETWEEN $3 AND $4
            ORDER BY a.fec_cam_est_teclb
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.fechaInicio);
        query.addParam(4, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

}
