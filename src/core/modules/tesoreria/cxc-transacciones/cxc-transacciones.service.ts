import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetFacturaCxCDto } from './dto/get-factura-cxc.dto';
import { GetFacturasPendientesClienteDto } from './dto/get-facturas-pendientes-cliente.dto';
import { GetTiposTransaccionPositivoDto } from './dto/get-tipos-transaccion-positivo.dto';

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

}
