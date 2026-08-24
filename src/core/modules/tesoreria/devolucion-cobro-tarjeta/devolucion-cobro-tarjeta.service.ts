import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetDevolucionesTarjetaDto } from './dto/get-devoluciones-tarjeta.dto';
import { GetFacturasTarjetaPendientesDto } from './dto/get-facturas-tarjeta-pendientes.dto';
import { GetReporteCobrosTarjetaDto } from './dto/get-reporte-cobros-tarjeta.dto';

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
     * Retención de una factura de venta, si tiene un comprobante ya registrado - usado por el
     * wizard tanto para recuperar el id tras guardar la retención con el diálogo ya existente de
     * Ventas (RegistrarRetencionVentaDialog, que no lo devuelve directamente) como para detectar
     * ANTES de mostrar ese diálogo que la factura ya tiene retención (una factura solo admite
     * UNA), y en ese caso mostrar el detalle ya cargado en vez de ofrecer cargar otra.
     */
    async getRetencionIdPorFactura(ideCccfa: number, dtoIn: HeaderParamsDto) {
        const qFac = new SelectQuery(`
            SELECT ide_cncre FROM cxc_cabece_factura
            WHERE ide_cccfa = $1 AND ide_empr = $2 AND ide_sucu = $3
        `);
        qFac.addIntParam(1, ideCccfa);
        qFac.addIntParam(2, dtoIn.ideEmpr);
        qFac.addIntParam(3, dtoIn.ideSucu);
        const factura = await this.dataSource.createSingleQuery(qFac);
        const ideCncre = factura?.ide_cncre ? Number(factura.ide_cncre) : null;
        if (!ideCncre) return { ide_cncre: null };

        const qCab = new SelectQuery(`
            SELECT numero_cncre, autorizacion_cncre, fecha_emisi_cncre
            FROM con_cabece_retenc
            WHERE ide_cncre = $1
        `);
        qCab.addIntParam(1, ideCncre);
        const cabecera = await this.dataSource.createSingleQuery(qCab);

        const qDet = new SelectQuery(`
            SELECT d.ide_cncim, i.nombre_cncim, i.casillero_cncim,
                   d.base_cndre, d.porcentaje_cndre, d.valor_cndre
            FROM con_detall_retenc d
            INNER JOIN con_cabece_impues i ON i.ide_cncim = d.ide_cncim
            WHERE d.ide_cncre = $1
            ORDER BY d.ide_cndre
        `);
        qDet.addIntParam(1, ideCncre);
        const detalles = await this.dataSource.createSelectQuery(qDet);
        const totalRetencion = detalles.reduce((sum, d) => sum + Number(d.valor_cndre || 0), 0);

        return {
            ide_cncre: ideCncre,
            numero_cncre: cabecera?.numero_cncre ?? null,
            autorizacion_cncre: cabecera?.autorizacion_cncre ?? null,
            fecha_emisi_cncre: cabecera?.fecha_emisi_cncre ?? null,
            detalles,
            total_retencion: Number(totalRetencion.toFixed(2)),
        };
    }

    /**
     * Listado de ciclos de Devolución de Cobros con Tarjeta ya registrados (página principal del
     * módulo, patrón "Registrar Envíos"/flete-consolidado): solo 2 estados posibles
     * (Activa/Anulada) porque finalizar() genera el ciclo completo de forma atómica - no existe
     * un estado intermedio "pendiente de pago" como en flete-consolidado.
     */
    async getDevolucionesTarjeta(dtoIn: GetDevolucionesTarjetaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                c.ide_tecdt,
                c.fecha_tecdt,
                c.anulado_tecdt,
                CASE WHEN c.anulado_tecdt THEN 'Anulada' ELSE 'Activa' END AS estado,
                CASE WHEN c.anulado_tecdt THEN 'error' ELSE 'success' END AS color_estado,
                c.ide_tecba,
                cb.nombre_tecba,
                b.nombre_teban,
                b.color_teban,
                b.foto_teban,
                c.ide_geper,
                p.nom_geper AS proveedor,
                c.ide_cpcfa,
                cf.numero_cpcfa,
                c.ide_cncre,
                cbd.nombre_tecba AS nombre_tecba_destino,
                c.valor_total_cobros_tecdt,
                c.valor_comision_tecdt,
                c.valor_iva_comision_tecdt,
                c.valor_retencion_iva_tecdt,
                c.valor_retencion_renta_tecdt,
                c.valor_neto_calculado_tecdt,
                c.valor_neto_transferido_tecdt,
                (SELECT COUNT(*) FROM tes_det_devol_cobro_tarjeta_fact d WHERE d.ide_tecdt = c.ide_tecdt) AS num_facturas,
                c.hora_ingre
            FROM tes_cab_devol_cobro_tarjeta c
            INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = c.ide_tecba
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = c.ide_cpcfa
            LEFT JOIN tes_cuenta_banco cbd ON cbd.ide_tecba = c.ide_tecba_destino
            WHERE c.ide_empr = $1
              AND c.ide_sucu = $2
              AND ($3::date IS NULL OR c.fecha_tecdt >= $3)
              AND ($4::date IS NULL OR c.fecha_tecdt <= $4)
            ORDER BY c.hora_ingre DESC
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.fechaDesde ?? null);
        query.addParam(4, dtoIn.fechaHasta ?? null);
        return this.dataSource.createQuery(query);
    }

    /**
     * Detalle de un ciclo de Devolución de Cobros con Tarjeta: cabecera (mismos campos que el
     * listado) + las facturas de venta cubiertas - para la página de detalle/anular.
     */
    async getDevolucionTarjetaById(ideTecdt: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                c.ide_tecdt,
                c.fecha_tecdt,
                c.anulado_tecdt,
                c.fecha_anula_tecdt,
                c.motivo_anula_tecdt,
                CASE WHEN c.anulado_tecdt THEN 'Anulada' ELSE 'Activa' END AS estado,
                CASE WHEN c.anulado_tecdt THEN 'error' ELSE 'success' END AS color_estado,
                c.ide_tecba,
                cb.nombre_tecba,
                b.nombre_teban,
                b.color_teban,
                b.foto_teban,
                c.ide_geper,
                p.nom_geper AS proveedor,
                p.identificac_geper,
                c.ide_cpcfa,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                cf.ide_cnccc AS ide_cnccc_comision,
                c.ide_cncre,
                r.numero_cncre,
                r.autorizacion_cncre,
                c.ide_teincb,
                ti.foto_teincb,
                c.ide_tecba_destino,
                cbd.nombre_tecba AS nombre_tecba_destino,
                c.ide_teclb_pago_comision,
                c.ide_teclb_debito_retencion,
                c.ide_teclb_retiro,
                c.ide_teclb_ingreso,
                c.valor_total_cobros_tecdt,
                c.valor_comision_tecdt,
                c.valor_iva_comision_tecdt,
                c.valor_retencion_iva_tecdt,
                c.valor_retencion_renta_tecdt,
                c.valor_neto_calculado_tecdt,
                c.valor_neto_transferido_tecdt,
                c.observacion_tecdt,
                c.hora_ingre
            FROM tes_cab_devol_cobro_tarjeta c
            INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = c.ide_tecba
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = c.ide_cpcfa
            LEFT JOIN con_cabece_retenc r ON r.ide_cncre = c.ide_cncre
            LEFT JOIN tes_info_comprobante_banco ti ON ti.ide_teincb = c.ide_teincb
            LEFT JOIN tes_cuenta_banco cbd ON cbd.ide_tecba = c.ide_tecba_destino
            WHERE c.ide_tecdt = $1
              AND c.ide_empr = $2
              AND c.ide_sucu = $3
        `);
        qCab.addIntParam(1, ideTecdt);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) return null;

        const qDet = new SelectQuery(`
            SELECT
                f.ide_tedtf,
                f.ide_cccfa,
                f.valor_cccfa_tedtf,
                cf.secuencial_cccfa,
                cf.fecha_emisi_cccfa,
                cf.ide_geper,
                p.nom_geper AS cliente
            FROM tes_det_devol_cobro_tarjeta_fact f
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = f.ide_cccfa
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            WHERE f.ide_tecdt = $1
            ORDER BY cf.fecha_emisi_cccfa ASC, f.ide_cccfa ASC
        `);
        qDet.addIntParam(1, ideTecdt);
        const facturas = await this.dataSource.createSelectQuery(qDet);

        return { ...cabecera, facturas };
    }

    /**
     * Reporte "Cobros con Tarjeta" (Ventas > Reportes): TODAS las facturas de venta cobradas con
     * tarjeta en el rango (liquidadas o no), para detectar errores de facturación con tarjeta y
     * diferencias entre lo que debió acreditarse y lo realmente depositado.
     *
     * Cuando la factura ya fue cubierta por un ciclo de Devolución de Cobros con Tarjeta (no
     * anulado), la comisión/IVA/retención/neto del ciclo (que es por CICLO, no por factura - un
     * mismo comprobante de comisión puede amparar varias facturas) se prorratean según el peso de
     * esta factura dentro del total cobrado del ciclo: valor_cobrado_tarjeta / valor_total_cobros.
     * Si aún no está liquidada, esos campos vienen NULL y estado = 'Pendiente' - así el usuario ve
     * de una vez qué facturas cobradas con tarjeta todavía no se han conciliado.
     */
    async getReporteCobrosTarjeta(dtoIn: GetReporteCobrosTarjetaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH base AS (
                SELECT
                    cf.ide_cccfa,
                    cf.secuencial_cccfa,
                    cf.fecha_emisi_cccfa,
                    cf.total_cccfa,
                    cf.ide_geper,
                    p.nom_geper AS cliente,
                    p.identificac_geper,
                    lb.ide_tecba,
                    cb.nombre_tecba,
                    b.nombre_teban,
                    b.foto_teban,
                    b.color_teban,
                    SUM(dt.valor_ccdtr) AS valor_cobrado_tarjeta,
                    c.ide_tecdt,
                    c.anulado_tecdt,
                    CASE
                        WHEN c.ide_tecdt IS NULL THEN 'Pendiente'
                        WHEN c.anulado_tecdt THEN 'Anulada'
                        ELSE 'Liquidada'
                    END AS estado,
                    CASE
                        WHEN c.ide_tecdt IS NULL THEN 'warning'
                        WHEN c.anulado_tecdt THEN 'default'
                        ELSE 'success'
                    END AS color_estado,
                    ROUND((c.valor_comision_tecdt * SUM(dt.valor_ccdtr) / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_comision,
                    ROUND((c.valor_iva_comision_tecdt * SUM(dt.valor_ccdtr) / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_iva_comision,
                    ROUND(((c.valor_retencion_iva_tecdt + c.valor_retencion_renta_tecdt) * SUM(dt.valor_ccdtr) / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_retencion,
                    ROUND((c.valor_neto_calculado_tecdt * SUM(dt.valor_ccdtr) / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_neto_calculado,
                    ROUND((c.valor_neto_transferido_tecdt * SUM(dt.valor_ccdtr) / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_neto_acreditado,
                    ROUND(((c.valor_neto_transferido_tecdt - c.valor_neto_calculado_tecdt) * SUM(dt.valor_ccdtr) / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS diferencia
                FROM cxc_detall_transa dt
                INNER JOIN tes_cab_libr_banc lb ON lb.ide_teclb = dt.ide_teclb
                INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = dt.ide_cccfa
                INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = lb.ide_tecba
                INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
                LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
                LEFT JOIN tes_det_devol_cobro_tarjeta_fact tdf ON tdf.ide_cccfa = cf.ide_cccfa
                LEFT JOIN tes_cab_devol_cobro_tarjeta c ON c.ide_tecdt = tdf.ide_tecdt
                WHERE dt.numero_pago_ccdtr > 0
                  AND dt.ide_cccfa IS NOT NULL
                  AND cf.ide_empr = $1
                  AND cf.ide_sucu = $2
                  AND ($3::date IS NULL OR cf.fecha_emisi_cccfa >= $3)
                  AND ($4::date IS NULL OR cf.fecha_emisi_cccfa <= $4)
                  AND ($5::bigint IS NULL OR lb.ide_tecba = $5)
                GROUP BY cf.ide_cccfa, cf.secuencial_cccfa, cf.fecha_emisi_cccfa, cf.total_cccfa,
                         cf.ide_geper, p.nom_geper, p.identificac_geper, lb.ide_tecba, cb.nombre_tecba,
                         b.nombre_teban, b.foto_teban, b.color_teban, c.ide_tecdt, c.anulado_tecdt,
                         c.valor_comision_tecdt, c.valor_iva_comision_tecdt, c.valor_retencion_iva_tecdt,
                         c.valor_retencion_renta_tecdt, c.valor_neto_calculado_tecdt,
                         c.valor_neto_transferido_tecdt, c.valor_total_cobros_tecdt
            )
            SELECT * FROM base
            WHERE ($6::boolean IS NOT TRUE OR ABS(COALESCE(diferencia, 0)) > 0.01)
            ORDER BY fecha_emisi_cccfa DESC, ide_cccfa DESC
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.fechaDesde ?? null);
        query.addParam(4, dtoIn.fechaHasta ?? null);
        query.addParam(5, dtoIn.ideTecba ?? null);
        query.addParam(6, dtoIn.conDiferencias === 'true');
        return this.dataSource.createQuery(query);
    }
}
