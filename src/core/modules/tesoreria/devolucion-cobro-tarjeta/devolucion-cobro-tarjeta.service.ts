import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetFacturasTarjetaPendientesDto } from './dto/get-facturas-tarjeta-pendientes.dto';

/**
 * Consultas de apoyo para el wizard de Devolución de Cobros con Tarjeta. La persistencia/
 * orquestación vive en DevolucionCobroTarjetaSaveService.
 */
@Injectable()
export class DevolucionCobroTarjetaService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    /**
     * Facturas de venta cobradas con la cuenta de tarjeta indicada (pago real registrado en
     * cxc_detall_transa vía tes_cab_libr_banc.ide_tecba - numero_pago_ccdtr > 0 identifica la
     * línea de cobro aplicado, no la carga original de la factura) que aún NO están cubiertas
     * por ningún ciclo de devolución (tes_det_devol_cobro_tarjeta_fact). Selección múltiple
     * para el primer paso del wizard.
     */
    async getFacturasTarjetaPendientes(dtoIn: GetFacturasTarjetaPendientesDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cf.ide_cccfa,
                cf.secuencial_cccfa,
                cf.fecha_emisi_cccfa,
                cf.total_cccfa,
                cf.ide_geper,
                p.nom_geper,
                p.identificac_geper,
                SUM(dt.valor_ccdtr) AS valor_cobrado_tarjeta
            FROM cxc_detall_transa dt
            INNER JOIN tes_cab_libr_banc lb ON lb.ide_teclb = dt.ide_teclb
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = dt.ide_cccfa
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            WHERE lb.ide_tecba = $1
              AND dt.numero_pago_ccdtr > 0
              AND dt.ide_cccfa IS NOT NULL
              AND cf.ide_empr = $2
              AND cf.ide_sucu = $3
              AND ($4::date IS NULL OR cf.fecha_emisi_cccfa >= $4)
              AND ($5::date IS NULL OR cf.fecha_emisi_cccfa <= $5)
              AND NOT EXISTS (
                  SELECT 1 FROM tes_det_devol_cobro_tarjeta_fact tf WHERE tf.ide_cccfa = cf.ide_cccfa
              )
            GROUP BY cf.ide_cccfa, cf.secuencial_cccfa, cf.fecha_emisi_cccfa, cf.total_cccfa,
                     cf.ide_geper, p.nom_geper, p.identificac_geper
            ORDER BY cf.fecha_emisi_cccfa ASC, cf.ide_cccfa ASC
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        query.addParam(4, dtoIn.fechaDesde ?? null);
        query.addParam(5, dtoIn.fechaHasta ?? null);
        // createQuery (no createSelectQuery) - DataTableQuery/useDataTableQuery en el frontend
        // exige la forma paginada { rows, columns, pagination, ... }, no un array plano.
        return this.dataSource.createQuery(query);
    }

    /**
     * Info batch de validación server-side de las facturas seleccionadas en el wizard: mismo
     * criterio de "cobrada con esta cuenta tarjeta y no cubierta aún" que
     * getFacturasTarjetaPendientes, pero acotado a una lista puntual de ide_cccfa (evita confiar
     * ciegamente en los valores que manda el frontend al finalizar).
     */
    async getInfoFacturasCobradasTarjeta(ideCccfaList: number[], ideTecba: number, dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cf.ide_cccfa,
                cf.secuencial_cccfa,
                cf.total_cccfa,
                cf.ide_geper,
                SUM(dt.valor_ccdtr) AS valor_cobrado_tarjeta,
                EXISTS (
                    SELECT 1 FROM tes_det_devol_cobro_tarjeta_fact tf WHERE tf.ide_cccfa = cf.ide_cccfa
                ) AS ya_cubierta
            FROM cxc_detall_transa dt
            INNER JOIN tes_cab_libr_banc lb ON lb.ide_teclb = dt.ide_teclb
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = dt.ide_cccfa
            WHERE lb.ide_tecba = $1
              AND dt.numero_pago_ccdtr > 0
              AND dt.ide_cccfa = ANY($2)
              AND cf.ide_empr = $3
              AND cf.ide_sucu = $4
            GROUP BY cf.ide_cccfa, cf.secuencial_cccfa, cf.total_cccfa, cf.ide_geper
        `);
        query.addIntParam(1, ideTecba);
        query.addParam(2, ideCccfaList);
        query.addIntParam(3, dtoIn.ideEmpr);
        query.addIntParam(4, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Datos de la factura de comisión (cxp_cabece_factur) necesarios para pagarla contra la
     * cuenta de tarjeta: su cuenta por pagar (ide_cpctr), si ya tiene asiento contable, y el
     * proveedor real del documento (para validar que coincide con el seleccionado en el wizard).
     */
    async getFacturaCxPInfo(ideCpcfa: number, dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cf.ide_cpcfa,
                cf.ide_geper,
                p.nom_geper,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                cf.valor_iva_cpcfa,
                cf.ide_cnccc,
                cf.pagado_cpcfa,
                ct.ide_cpctr
            FROM cxp_cabece_factur cf
            INNER JOIN cxp_cabece_transa ct ON ct.ide_cpcfa = cf.ide_cpcfa
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            WHERE cf.ide_cpcfa = $1
              AND cf.ide_empr = $2
              AND cf.ide_sucu = $3
        `);
        query.addIntParam(1, ideCpcfa);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Detalle de un comprobante de retención en venta YA registrado (con_cabece_retenc,
     * es_venta_cncre = true), clasificado por tipo de impuesto (ide_cnimp = 1 → renta, resto →
     * IVA) - mismo criterio que AsientosAutomaticosService.generarAsientoFacturaCxC - para
     * cuando el usuario selecciona una retención ya cargada en vez de subir un XML nuevo.
     */
    async getDetalleRetencionVenta(ideCncre: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT ide_cncre, es_venta_cncre, numero_cncre, autorizacion_cncre
            FROM con_cabece_retenc
            WHERE ide_cncre = $1 AND es_venta_cncre = TRUE
        `);
        qCab.addIntParam(1, ideCncre);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) return null;

        const qDet = new SelectQuery(`
            SELECT d.ide_cncim, d.valor_cndre, i.ide_cnimp
            FROM con_detall_retenc d
            INNER JOIN con_cabece_impues i ON i.ide_cncim = d.ide_cncim
            WHERE d.ide_cncre = $1
        `);
        qDet.addIntParam(1, ideCncre);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        return { cabecera, detalles };
    }

    /**
     * ide_cncre de una factura de venta, si tiene un comprobante de retención registrado - usado
     * por el wizard para recuperar el id tras guardar la retención con el diálogo ya existente
     * de Ventas (RegistrarRetencionVentaDialog), que no lo devuelve directamente.
     */
    async getRetencionIdPorFactura(ideCccfa: number, dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT ide_cncre FROM cxc_cabece_factura
            WHERE ide_cccfa = $1 AND ide_empr = $2 AND ide_sucu = $3
        `);
        query.addIntParam(1, ideCccfa);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        const row = await this.dataSource.createSingleQuery(query);
        return { ide_cncre: row?.ide_cncre ? Number(row.ide_cncre) : null };
    }
}
