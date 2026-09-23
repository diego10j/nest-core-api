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
 * Retención de un ciclo, DERIVADA (no se guarda en la cabecera): por cada comprobante vinculado en
 * tes_det_devol_cobro_tarjeta_ret se suma con_detall_retenc SOLO de las facturas del ciclo
 * (tes_det_devol_cobro_tarjeta_fact) - un mismo comprobante puede repartirse entre varios ciclos.
 * Es el valor legal según los comprobantes; lo realmente contabilizado es el valor de la nota de
 * débito de cada comprobante (tes_cab_libr_banc.valor_teclb) y lo esperado al liquidar queda
 * congelado en valor_neto_calculado_tecdt.
 */
const SQL_JOIN_RETENCION_CICLO = `
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(SUM(d.valor_cndre) FILTER (WHERE i.ide_cnimp = 0), 0) AS iva,
            COALESCE(SUM(d.valor_cndre) FILTER (WHERE i.ide_cnimp = 1), 0) AS renta
        FROM tes_det_devol_cobro_tarjeta_ret rr
        INNER JOIN con_detall_retenc d ON d.ide_cncre = rr.ide_cncre
            AND d.ide_cccfa IN (SELECT tf.ide_cccfa FROM tes_det_devol_cobro_tarjeta_fact tf WHERE tf.ide_tecdt = c.ide_tecdt)
        INNER JOIN con_cabece_impues i ON i.ide_cncim = d.ide_cncim
        WHERE rr.ide_tecdt = c.ide_tecdt
    ) ret ON TRUE
`;

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
     * Comprobantes de retención de venta que ya amparan alguna de las facturas indicadas, con la
     * porción de IVA/Renta que le corresponde a ESAS facturas (con_detall_retenc.ide_cccfa) - no
     * el total del comprobante: un mismo comprobante (uno o varios por mes, ej. Bendo) puede
     * cubrir facturas de varios depósitos, así que cada ciclo toma solo lo suyo. Solo cuentan los
     * comprobantes aún vinculados a la factura (cxc_cabece_factura.ide_cncre - anular un
     * comprobante la desvincula).
     */
    async getRetencionesPorFacturas(ideCccfaList: number[], dtoIn: HeaderParamsDto) {
        if (!ideCccfaList.length) return [];
        const query = new SelectQuery(`
            SELECT r.ide_cncre, r.numero_cncre, r.autorizacion_cncre, r.fecha_emisi_cncre,
                   COALESCE(SUM(d.valor_cndre) FILTER (WHERE i.ide_cnimp = 0), 0) AS valor_iva,
                   COALESCE(SUM(d.valor_cndre) FILTER (WHERE i.ide_cnimp = 1), 0) AS valor_renta,
                   MAX(d.ide_cncim) FILTER (WHERE i.ide_cnimp = 0) AS ide_cncim_iva,
                   MAX(d.ide_cncim) FILTER (WHERE i.ide_cnimp = 1) AS ide_cncim_renta
            FROM con_detall_retenc d
            INNER JOIN con_cabece_retenc r ON r.ide_cncre = d.ide_cncre
            INNER JOIN con_cabece_impues i ON i.ide_cncim = d.ide_cncim
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = d.ide_cccfa AND cf.ide_cncre = d.ide_cncre
            WHERE d.ide_cccfa = ANY($1)
              AND r.es_venta_cncre = TRUE
              AND cf.ide_empr = $2
              AND cf.ide_sucu = $3
            GROUP BY r.ide_cncre, r.numero_cncre, r.autorizacion_cncre, r.fecha_emisi_cncre
            ORDER BY r.fecha_emisi_cncre, r.ide_cncre
        `);
        query.addParam(1, ideCccfaList);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Facturas de venta cobradas con la cuenta de tarjeta que aún NO tienen comprobante de
     * retención, en cualquier estado del ciclo (pendientes de liquidar o ya liquidadas) - son las
     * candidatas al registrar un comprobante de retención, que puede llegar antes o después de
     * liquidar el depósito y cubrir cobros de varios depósitos (ver saveRetencionLote).
     */
    async getFacturasTarjetaSinRetencion(dtoIn: GetFacturasTarjetaPendientesDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cf.ide_cccfa,
                cf.secuencial_cccfa,
                cf.fecha_emisi_cccfa,
                cf.total_cccfa,
                cf.ide_geper,
                p.nom_geper,
                p.identificac_geper,
                SUM(dt.valor_ccdtr) AS valor_cobrado_tarjeta,
                COALESCE(cf.base_grabada_cccfa, 0) AS base_grabada_cccfa,
                COALESCE(cf.valor_iva_cccfa, 0) AS valor_iva_cccfa,
                MAX(tf.ide_tecdt) AS ide_tecdt
            FROM cxc_detall_transa dt
            INNER JOIN tes_cab_libr_banc lb ON lb.ide_teclb = dt.ide_teclb
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = dt.ide_cccfa
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            LEFT JOIN tes_det_devol_cobro_tarjeta_fact tf ON tf.ide_cccfa = cf.ide_cccfa
            WHERE lb.ide_tecba = $1
              AND dt.numero_pago_ccdtr > 0
              AND dt.ide_cccfa IS NOT NULL
              AND cf.ide_cncre IS NULL
              AND cf.ide_empr = $2
              AND cf.ide_sucu = $3
              AND ($4::date IS NULL OR cf.fecha_emisi_cccfa >= $4)
              AND ($5::date IS NULL OR cf.fecha_emisi_cccfa <= $5)
            GROUP BY cf.ide_cccfa, cf.secuencial_cccfa, cf.fecha_emisi_cccfa, cf.total_cccfa,
                     cf.ide_geper, p.nom_geper, p.identificac_geper, cf.base_grabada_cccfa, cf.valor_iva_cccfa
            ORDER BY cf.fecha_emisi_cccfa ASC, cf.ide_cccfa ASC
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        query.addParam(4, dtoIn.fechaDesde ?? null);
        query.addParam(5, dtoIn.fechaHasta ?? null);
        return this.dataSource.createSelectQuery(query);
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
                cbd.nombre_tecba AS nombre_tecba_destino,
                c.valor_total_cobros_tecdt,
                c.valor_comision_tecdt,
                c.valor_iva_comision_tecdt,
                ret.iva AS valor_retencion_iva_tecdt,
                ret.renta AS valor_retencion_renta_tecdt,
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
            ${SQL_JOIN_RETENCION_CICLO}
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
                p.direccion_geper,
                p.telefono_geper,
                p.correo_geper,
                c.ide_cpcfa,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                cf.ide_cnccc AS ide_cnccc_comision,
                c.ide_teincb,
                ti.foto_teincb,
                c.ide_tecba_destino,
                cbd.nombre_tecba AS nombre_tecba_destino,
                bd.nombre_teban AS nombre_teban_destino,
                bd.foto_teban AS foto_teban_destino,
                bd.color_teban AS color_teban_destino,
                c.ide_teclb_pago_comision,
                c.ide_teclb_retiro,
                c.ide_teclb_ingreso,
                lbp.ide_cnccc AS ide_cnccc_pago_comision,
                lbt.ide_cnccc AS ide_cnccc_transferencia,
                c.valor_total_cobros_tecdt,
                c.valor_comision_tecdt,
                c.valor_iva_comision_tecdt,
                ret.iva AS valor_retencion_iva_tecdt,
                ret.renta AS valor_retencion_renta_tecdt,
                c.valor_neto_calculado_tecdt,
                c.valor_neto_transferido_tecdt,
                c.observacion_tecdt,
                c.hora_ingre
            FROM tes_cab_devol_cobro_tarjeta c
            INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = c.ide_tecba
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = c.ide_cpcfa
            LEFT JOIN tes_info_comprobante_banco ti ON ti.ide_teincb = c.ide_teincb
            LEFT JOIN tes_cab_libr_banc lbp ON lbp.ide_teclb = c.ide_teclb_pago_comision
            LEFT JOIN tes_cab_libr_banc lbt ON lbt.ide_teclb = c.ide_teclb_retiro
            LEFT JOIN tes_cuenta_banco cbd ON cbd.ide_tecba = c.ide_tecba_destino
            LEFT JOIN tes_banco bd ON bd.ide_teban = cbd.ide_teban
            ${SQL_JOIN_RETENCION_CICLO}
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
                p.nom_geper AS cliente,
                cf.ide_cncre
            FROM tes_det_devol_cobro_tarjeta_fact f
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = f.ide_cccfa
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            WHERE f.ide_tecdt = $1
            ORDER BY cf.fecha_emisi_cccfa ASC, f.ide_cccfa ASC
        `);
        qDet.addIntParam(1, ideTecdt);
        const facturas = await this.dataSource.createSelectQuery(qDet);

        // Retenciones YA aplicadas a este ciclo (una fila por comprobante: el movimiento contable
        // que la descontó, si lo hubo, y en detalles su porción de las facturas del ciclo) y las que ya
        // amparan facturas del ciclo pero todavía no se aplicaron (ej. el comprobante llegó
        // después de liquidar el depósito) - se muestran para poder adjuntarlas.
        const ideCccfaList = facturas.map((f) => Number(f.ide_cccfa));
        const qRet = new SelectQuery(`
            SELECT rr.ide_tedtr, rr.ide_cncre, rr.ide_teclb_debito_retencion,
                   r.numero_cncre, r.autorizacion_cncre, r.fecha_emisi_cncre,
                   lb.ide_cnccc AS ide_cnccc_retencion, lb.valor_teclb AS valor_contabilizado
            FROM tes_det_devol_cobro_tarjeta_ret rr
            INNER JOIN con_cabece_retenc r ON r.ide_cncre = rr.ide_cncre
            LEFT JOIN tes_cab_libr_banc lb ON lb.ide_teclb = rr.ide_teclb_debito_retencion
            WHERE rr.ide_tecdt = $1
            ORDER BY rr.ide_tedtr
        `);
        qRet.addIntParam(1, ideTecdt);
        const filasRet = await this.dataSource.createSelectQuery(qRet);

        const ideCncreList = filasRet.map((r) => Number(r.ide_cncre));
        const qRetDet = new SelectQuery(`
            SELECT d.ide_cncre, d.ide_cncim, i.nombre_cncim, i.casillero_cncim,
                   SUM(d.base_cndre) AS base_cndre, MAX(d.porcentaje_cndre) AS porcentaje_cndre,
                   SUM(d.valor_cndre) AS valor_cndre
            FROM con_detall_retenc d
            INNER JOIN con_cabece_impues i ON i.ide_cncim = d.ide_cncim
            WHERE d.ide_cncre = ANY($1) AND d.ide_cccfa = ANY($2)
            GROUP BY d.ide_cncre, d.ide_cncim, i.nombre_cncim, i.casillero_cncim
            ORDER BY d.ide_cncre, MIN(d.ide_cndre)
        `);
        qRetDet.addParam(1, ideCncreList);
        qRetDet.addParam(2, ideCccfaList);
        const detallesRet = ideCncreList.length ? await this.dataSource.createSelectQuery(qRetDet) : [];

        const retenciones = filasRet.map((r) => {
            const detalles = detallesRet.filter((d) => Number(d.ide_cncre) === Number(r.ide_cncre));
            const total = detalles.reduce((sum, d) => sum + Number(d.valor_cndre || 0), 0);
            return { ...r, detalles, total_retencion: Number(total.toFixed(2)) };
        });

        const aplicadas = new Set(ideCncreList);
        const retencionesPendientes = (await this.getRetencionesPorFacturas(ideCccfaList, dtoIn)).filter(
            (r) => !aplicadas.has(Number(r.ide_cncre)),
        );

        return { ...cabecera, facturas, retenciones, retenciones_pendientes: retencionesPendientes };
    }

    /**
     * Reporte "Cobros con Tarjeta" (Ventas > Reportes): SOLO las facturas de venta ya cubiertas
     * por un ciclo de Devolución de Cobros con Tarjeta registrado en
     * tes_det_devol_cobro_tarjeta_fact/tes_cab_devol_cobro_tarjeta - a propósito NO incluye
     * facturas cobradas con tarjeta anteriores a este módulo (nunca pasarán por el nuevo proceso,
     * así que mostrarlas como "pendientes" para siempre solo sería ruido).
     *
     * La comisión/IVA/neto del ciclo (que es por CICLO, no por factura - un mismo comprobante de
     * comisión puede amparar varias facturas) se prorratea según el peso de esta factura dentro
     * del total cobrado del ciclo: valor_cccfa_tedtf / valor_total_cobros_tecdt. La retención NO
     * se prorratea: se suma directo de con_detall_retenc filtrado por `ide_cccfa` - es la
     * porción REAL de esta factura, ya calculada al guardar la retención (ver
     * RetencionVentaSaveService.saveRetencionLote), no una aproximación por peso. El rango de
     * fechas filtra por la fecha del CICLO (fecha_tecdt), no por la fecha de emisión de la
     * factura - es cuándo se registró en la nueva tabla, según lo pedido.
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
                    c.ide_tecba,
                    cb.nombre_tecba,
                    b.nombre_teban,
                    b.foto_teban,
                    b.color_teban,
                    tdf.valor_cccfa_tedtf AS valor_cobrado_tarjeta,
                    c.ide_tecdt,
                    c.fecha_tecdt,
                    c.anulado_tecdt,
                    CASE WHEN c.anulado_tecdt THEN 'Anulada' ELSE 'Liquidada' END AS estado,
                    CASE WHEN c.anulado_tecdt THEN 'default' ELSE 'success' END AS color_estado,
                    ROUND((c.valor_comision_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_comision,
                    ROUND((c.valor_iva_comision_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_iva_comision,
                    COALESCE(ret.total, 0) AS valor_retencion,
                    -- Neto por factura = su cobro menos su comisión (prorrateada) menos su
                    -- retención REAL (no prorrateada) - más preciso que prorratear el neto del
                    -- ciclo completo, ahora que la retención real por factura existe.
                    tdf.valor_cccfa_tedtf
                        - ROUND((c.valor_comision_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2)
                        - ROUND((c.valor_iva_comision_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2)
                        - COALESCE(ret.total, 0) AS valor_neto_calculado,
                    ROUND((c.valor_neto_transferido_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_neto_acreditado,
                    ROUND((c.valor_neto_transferido_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2)
                        - (
                            tdf.valor_cccfa_tedtf
                            - ROUND((c.valor_comision_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2)
                            - ROUND((c.valor_iva_comision_tecdt * tdf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2)
                            - COALESCE(ret.total, 0)
                        ) AS diferencia
                FROM tes_det_devol_cobro_tarjeta_fact tdf
                INNER JOIN tes_cab_devol_cobro_tarjeta c ON c.ide_tecdt = tdf.ide_tecdt
                INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = tdf.ide_cccfa
                INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = c.ide_tecba
                INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
                LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
                LEFT JOIN LATERAL (
                    SELECT SUM(d.valor_cndre) AS total
                    FROM con_detall_retenc d
                    WHERE d.ide_cncre = cf.ide_cncre AND d.ide_cccfa = cf.ide_cccfa
                ) ret ON cf.ide_cncre IS NOT NULL
                WHERE c.ide_empr = $1
                  AND c.ide_sucu = $2
                  AND ($3::date IS NULL OR c.fecha_tecdt >= $3)
                  AND ($4::date IS NULL OR c.fecha_tecdt <= $4)
                  AND ($5::bigint IS NULL OR c.ide_tecba = $5)
            )
            SELECT * FROM base
            WHERE ($6::boolean IS NOT TRUE OR ABS(COALESCE(diferencia, 0)) > 0.01)
            ORDER BY fecha_tecdt DESC, ide_cccfa DESC
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
