import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetFacturasPendientesProveedorDto } from './dto/get-facturas-pendientes-proveedor.dto';

/**
 * Consultas de apoyo para el pago/anticipo a proveedores desde tesorería.
 * Migrado de ServicioProveedor.getSqlCuentasPorPagar del legacy.
 */
@Injectable()
export class CxpTransaccionesService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxp_tipo_trans_pago',
                'p_cxp_tipo_trans_anticipo',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Cuentas por pagar del proveedor con saldo pendiente (selección múltiple
     * para distribuir un pago). Paridad ServicioProveedor.getSqlCuentasPorPagar.
     */
    async getFacturasPendientesProveedor(dtoIn: GetFacturasPendientesProveedorDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT dt.ide_cpctr,
                   ct.ide_cpcfa,
                   cf.numero_cpcfa,
                   co.nombre_cntdo,
                   COALESCE(cf.fecha_emisi_cpcfa, ct.fecha_trans_cpctr) AS fecha,
                   cf.total_cpcfa,
                   cf.dias_credito_cpcfa,
                   SUM(dt.valor_cpdtr * tt.signo_cpttr) AS saldo_x_pagar,
                   COALESCE(cf.observacion_cpcfa, ct.observacion_cpctr) AS observacion
            FROM cxp_detall_transa dt
            INNER JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = ct.ide_cpcfa
            LEFT JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            LEFT JOIN con_tipo_document co ON cf.ide_cntdo = co.ide_cntdo
            WHERE ct.ide_geper = $1
              AND ct.ide_sucu = $2
            GROUP BY dt.ide_cpctr, ct.ide_cpcfa, cf.numero_cpcfa, co.nombre_cntdo,
                     cf.fecha_emisi_cpcfa, ct.fecha_trans_cpctr, cf.total_cpcfa,
                     cf.dias_credito_cpcfa, cf.observacion_cpcfa, ct.observacion_cpctr
            HAVING SUM(dt.valor_cpdtr * tt.signo_cpttr) > 0
            ORDER BY fecha ASC, dt.ide_cpctr ASC
        `);
        query.addIntParam(1, dtoIn.ideGeper);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Siguiente número de pago para una cuenta por pagar (paridad
     * ServicioCuentasCxP.getNumeroPagoDocumento: MAX(numero_pago_cpdtr)+1)
     */
    async getNumeroPagoDocumento(ideCpctr: number) {
        const query = new SelectQuery(`
            SELECT COALESCE(MAX(numero_pago_cpdtr), 0) + 1 AS numero_pago
            FROM cxp_detall_transa
            WHERE ide_cpctr = $1
        `);
        query.addIntParam(1, ideCpctr);
        const result = await this.dataSource.createSingleQuery(query);
        return result?.numero_pago ?? 1;
    }

    /** Saldo actual de una cuenta por pagar */
    async getSaldoTransaccion(ideCpctr: number) {
        const query = new SelectQuery(`
            SELECT COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0) AS saldo
            FROM cxp_detall_transa dt
            JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            WHERE dt.ide_cpctr = $1
        `);
        query.addIntParam(1, ideCpctr);
        const result = await this.dataSource.createSingleQuery(query);
        return Number(result?.saldo ?? 0);
    }

    /**
     * Información batch (saldo, número de documento, proveedor) de un conjunto
     * de cuentas por pagar seleccionadas para distribuir un pago.
     */
    async getInfoTransacciones(ideCpctrList: number[]) {
        const query = new SelectQuery(`
            SELECT ct.ide_cpctr,
                   cf.ide_cpcfa,
                   cf.numero_cpcfa,
                   ct.ide_geper,
                   p.nom_geper,
                   COALESCE(SUM(dt.valor_cpdtr * tt.signo_cpttr), 0) AS saldo
            FROM cxp_cabece_transa ct
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = ct.ide_cpcfa
            LEFT JOIN cxp_detall_transa dt ON dt.ide_cpctr = ct.ide_cpctr
            LEFT JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            LEFT JOIN gen_persona p ON p.ide_geper = ct.ide_geper
            WHERE ct.ide_cpctr = ANY($1)
            GROUP BY ct.ide_cpctr, cf.ide_cpcfa, cf.numero_cpcfa, ct.ide_geper, p.nom_geper
        `);
        query.addParam(1, ideCpctrList);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Cabecera de "pago adicional" reutilizable del proveedor (saldo a favor
     * sin documento asociado), paridad generarTransaccionPagoAdicionalCxP.
     */
    async getCabeceraPagoAdicional(ideGeper: number, dtoIn: HeaderParamsDto) {
        const tipoTransPago = Number(this.variables.get('p_cxp_tipo_trans_pago'));
        const query = new SelectQuery(`
            SELECT ide_cpctr
            FROM cxp_cabece_transa
            WHERE ide_cpttr = $1
              AND ide_cpcfa IS NULL
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
