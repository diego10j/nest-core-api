import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { GetDevolucionesTarjetaDto } from './dto/get-devoluciones-tarjeta.dto';
import { GetFacturasTarjetaPendientesDto } from './dto/get-facturas-tarjeta-pendientes.dto';
import { GetReporteCobrosTarjetaDto } from './dto/get-reporte-cobros-tarjeta.dto';

/**
 * Retención de un ciclo ANTERIOR al modelo por cortes, DERIVADA (no se guarda en la cabecera): por
 * cada comprobante vinculado en tes_det_devol_cobro_tarjeta_ret se suma con_detall_retenc SOLO de
 * las facturas del ciclo (tes_det_devol_cobro_tarjeta_fact). Las acreditaciones nuevas no tienen
 * filas ahí: su retención llega en un corte (tes_cab_corte_tarjeta).
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
 * Valores del procesador por pago (Excel de liquidación) sumados para una acreditación. Un ciclo
 * anterior (con factura de comisión, ide_cpcfa) guarda su comisión en la cabecera; una
 * acreditación nueva la deriva de estas filas.
 */
const SQL_JOIN_LIQUIDACION_CICLO = `
    LEFT JOIN LATERAL (
        SELECT
            COALESCE(SUM(f.valor_comision_tedtf), 0) AS comision,
            COALESCE(SUM(f.valor_iva_comision_tedtf), 0) AS iva_comision,
            COALESCE(SUM(f.valor_ret_iva_tedtf), 0) AS ret_iva,
            COALESCE(SUM(f.valor_ret_renta_tedtf), 0) AS ret_renta
        FROM tes_det_devol_cobro_tarjeta_fact f
        WHERE f.ide_tecdt = c.ide_tecdt
    ) liq ON TRUE
`;

/**
 * Avance de cada pago de una acreditación (alias: `f` = tes_det_devol_cobro_tarjeta_fact, `cf` =
 * factura de venta, `c` = tes_cab_devol_cobro_tarjeta). Se DERIVA en vez de guardarse: los
 * documentos llegan en cortes que no coinciden con las acreditaciones (y la retención también puede
 * ligarse a la factura desde Ventas), así que un estado guardado quedaría desactualizado.
 *   - "requiere": la comisión / retención solo se exige si el Excel de liquidación la informó (> 0).
 *   - "con": la comisión está cuando hay una factura en un corte vigente (o es un ciclo anterior,
 *     que la trae en la cabecera); la retención cuando hay comprobante en la factura o en un corte.
 */
const SQL_PAGO_REQUIERE_COMISION = `(COALESCE(f.valor_comision_tedtf, 0) + COALESCE(f.valor_iva_comision_tedtf, 0) > 0)`;
const SQL_PAGO_REQUIERE_RETENCION = `(COALESCE(f.valor_ret_iva_tedtf, 0) + COALESCE(f.valor_ret_renta_tedtf, 0) > 0)`;
const SQL_PAGO_CON_COMISION = `(
    c.ide_cpcfa IS NOT NULL
    OR EXISTS (
        SELECT 1 FROM tes_det_corte_tarjeta dc
        INNER JOIN tes_cab_corte_tarjeta ct ON ct.ide_tecct = dc.ide_tecct
        WHERE dc.ide_cccfa = f.ide_cccfa AND ct.ide_cpcfa IS NOT NULL AND ct.anulado_tecct = FALSE
    )
)`;
const SQL_PAGO_CON_RETENCION = `(
    cf.ide_cncre IS NOT NULL
    OR EXISTS (
        SELECT 1 FROM tes_det_corte_tarjeta dc
        INNER JOIN tes_cab_corte_tarjeta ct ON ct.ide_tecct = dc.ide_tecct
        WHERE dc.ide_cccfa = f.ide_cccfa AND ct.ide_cncre IS NOT NULL AND ct.anulado_tecct = FALSE
    )
)`;

/**
 * Resumen por acreditación (alias `prog`): cuántos de sus pagos aún no tienen la factura de comisión
 * o el comprobante de retención que les corresponde, y cuántos ya tienen algún avance.
 */
const SQL_JOIN_PROGRESO_ACREDITACION = `
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE ${SQL_PAGO_REQUIERE_COMISION} AND NOT ${SQL_PAGO_CON_COMISION}) AS pagos_sin_comision,
            COUNT(*) FILTER (WHERE ${SQL_PAGO_REQUIERE_RETENCION} AND NOT ${SQL_PAGO_CON_RETENCION}) AS pagos_sin_retencion,
            COUNT(*) FILTER (WHERE (${SQL_PAGO_REQUIERE_COMISION} AND ${SQL_PAGO_CON_COMISION})
                                OR (${SQL_PAGO_REQUIERE_RETENCION} AND ${SQL_PAGO_CON_RETENCION})) AS pagos_con_avance
        FROM tes_det_devol_cobro_tarjeta_fact f
        INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = f.ide_cccfa
        WHERE f.ide_tecdt = c.ide_tecdt
    ) prog ON TRUE
`;

/**
 * Estado de una acreditación (requiere SQL_JOIN_PROGRESO_ACREDITACION):
 *   Anulada | Acreditada (nada de comisión/retención aún) | Parcial (algún avance) | Completa.
 * Un ciclo anterior (con factura de comisión en la cabecera) ya nació completo.
 */
const SQL_ESTADO_ACREDITACION = `
    CASE
        WHEN c.anulado_tecdt THEN 'Anulada'
        WHEN c.ide_cpcfa IS NOT NULL OR (prog.pagos_sin_comision = 0 AND prog.pagos_sin_retencion = 0) THEN 'Completa'
        WHEN prog.pagos_con_avance = 0 THEN 'Acreditada'
        ELSE 'Parcial'
    END AS estado,
    CASE
        WHEN c.anulado_tecdt THEN 'error'
        WHEN c.ide_cpcfa IS NOT NULL OR (prog.pagos_sin_comision = 0 AND prog.pagos_sin_retencion = 0) THEN 'success'
        WHEN prog.pagos_con_avance = 0 THEN 'warning'
        ELSE 'info'
    END AS color_estado,
    prog.pagos_sin_comision,
    prog.pagos_sin_retencion
`;

/**
 * Consultas de apoyo del proceso de cobros con tarjeta (acreditaciones y cortes del procesador).
 * La persistencia/orquestación vive en DevolucionCobroTarjetaSaveService y CorteTarjetaSaveService.
 */
@Injectable()
export class DevolucionCobroTarjetaService extends BaseService {
    constructor(private readonly dataSource: DataSourceService) {
        super();
    }

    /**
     * Pagos (facturas de venta cobradas con la cuenta de tarjeta indicada - pago real registrado en
     * cxc_detall_transa vía tes_cab_libr_banc.ide_tecba, numero_pago_ccdtr > 0 identifica la línea de
     * cobro aplicado, no la carga original de la factura) que aún tienen algo por registrar: su
     * acreditación (tes_det_devol_cobro_tarjeta_fact) o su corte (comisión/retención). Es la lista
     * única del registro de cobros con tarjeta: el Excel de liquidación se empareja contra los que
     * faltan por acreditar y los documentos del corte contra los que faltan por cortar.
     *
     * `ide_tecdt` es la acreditación que ya cubre el pago y `en_corte` indica que ya tiene
     * comprobante de retención o pertenece a un corte vigente. Trae la base gravada y el IVA (contra
     * los que se valida el XML de la retención) y, si el pago ya está acreditado, la comisión y la
     * retención que el procesador aplicó según su Excel (contra las que se validan los documentos).
     */
    async getFacturasTarjetaPendientes(dtoIn: GetFacturasTarjetaPendientesDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT * FROM (
                SELECT
                    cf.ide_cccfa,
                    cf.secuencial_cccfa,
                    cf.fecha_emisi_cccfa,
                    cf.total_cccfa,
                    cf.ide_geper,
                    p.nom_geper,
                    p.identificac_geper,
                    COALESCE(cf.base_grabada_cccfa, 0) AS base_grabada_cccfa,
                    COALESCE(cf.valor_iva_cccfa, 0) AS valor_iva_cccfa,
                    SUM(dt.valor_ccdtr) AS valor_cobrado_tarjeta,
                    tf.ide_tecdt,
                    (
                        cf.ide_cncre IS NOT NULL
                        OR EXISTS (SELECT 1 FROM tes_det_corte_tarjeta dc WHERE dc.ide_cccfa = cf.ide_cccfa)
                    ) AS en_corte,
                    tf.valor_comision_tedtf + tf.valor_iva_comision_tedtf AS comision_liquidada,
                    tf.valor_ret_iva_tedtf + tf.valor_ret_renta_tedtf AS retencion_liquidada
                FROM cxc_detall_transa dt
                INNER JOIN tes_cab_libr_banc lb ON lb.ide_teclb = dt.ide_teclb
                INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = dt.ide_cccfa
                LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
                LEFT JOIN tes_det_devol_cobro_tarjeta_fact tf ON tf.ide_cccfa = cf.ide_cccfa
                WHERE lb.ide_tecba = $1
                  AND dt.numero_pago_ccdtr > 0
                  AND dt.ide_cccfa IS NOT NULL
                  AND cf.ide_empr = $2
                  AND cf.ide_sucu = $3
                  AND ($4::date IS NULL OR cf.fecha_emisi_cccfa >= $4)
                  AND ($5::date IS NULL OR cf.fecha_emisi_cccfa <= $5)
                GROUP BY cf.ide_cccfa, cf.secuencial_cccfa, cf.fecha_emisi_cccfa, cf.total_cccfa,
                         cf.ide_geper, p.nom_geper, p.identificac_geper, cf.base_grabada_cccfa,
                         cf.valor_iva_cccfa, cf.ide_cncre, tf.ide_tecdt, tf.valor_comision_tedtf,
                         tf.valor_iva_comision_tedtf, tf.valor_ret_iva_tedtf, tf.valor_ret_renta_tedtf
            ) x
            WHERE x.ide_tecdt IS NULL OR NOT x.en_corte
            ORDER BY x.fecha_emisi_cccfa ASC, x.ide_cccfa ASC
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        query.addParam(4, dtoIn.fechaDesde ?? null);
        query.addParam(5, dtoIn.fechaHasta ?? null);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Info batch de validación server-side de los pagos seleccionados al registrar una
     * acreditación: "cobrado con esta cuenta de tarjeta y sin acreditación registrada", acotado a
     * una lista puntual de ide_cccfa (evita confiar ciegamente en lo que manda el frontend).
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
     * Liquidaciones del procesador (por su número) que ya tienen una acreditación vigente: una
     * liquidación es UNA transferencia y no puede registrarse dos veces. Devuelve, por número, la
     * acreditación que la contiene.
     */
    async getLiquidacionesRegistradas(numeros: string[], dtoIn: HeaderParamsDto) {
        if (!numeros.length) return [];
        const query = new SelectQuery(`
            SELECT DISTINCT tf.numero_liquidacion_tedtf AS numero, c.ide_tecdt, c.fecha_tecdt
            FROM tes_det_devol_cobro_tarjeta_fact tf
            INNER JOIN tes_cab_devol_cobro_tarjeta c ON c.ide_tecdt = tf.ide_tecdt
            WHERE tf.numero_liquidacion_tedtf = ANY($1)
              AND c.anulado_tecdt = FALSE
              AND c.ide_empr = $2
              AND c.ide_sucu = $3
        `);
        query.addParam(1, numeros);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /** Procesador (proveedor) configurado en la cuenta de tarjeta, o por defecto en su banco */
    async getProcesadorCuenta(ideTecba: number): Promise<number | null> {
        const query = new SelectQuery(`
            SELECT COALESCE(cb.ide_geper_comision_tecba, b.ide_geper_comision_teban) AS ide_geper
            FROM tes_cuenta_banco cb
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            WHERE cb.ide_tecba = $1
        `);
        query.addIntParam(1, ideTecba);
        const row = await this.dataSource.createSingleQuery(query);
        return row?.ide_geper ? Number(row.ide_geper) : null;
    }

    /**
     * Info batch de validación de los pagos seleccionados al registrar un corte: "cobrado con esta
     * cuenta de tarjeta", si ya pertenece a otro corte vigente y si ya tiene comprobante de retención.
     */
    async getInfoFacturasParaCorte(ideCccfaList: number[], ideTecba: number, dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                cf.ide_cccfa,
                cf.secuencial_cccfa,
                cf.ide_cncre,
                EXISTS (
                    SELECT 1 FROM tes_det_corte_tarjeta dc WHERE dc.ide_cccfa = cf.ide_cccfa
                ) AS en_corte
            FROM cxc_cabece_factura cf
            WHERE cf.ide_cccfa = ANY($2)
              AND cf.ide_empr = $3
              AND cf.ide_sucu = $4
              AND EXISTS (
                  SELECT 1 FROM cxc_detall_transa dt
                  INNER JOIN tes_cab_libr_banc lb ON lb.ide_teclb = dt.ide_teclb
                  WHERE dt.ide_cccfa = cf.ide_cccfa AND dt.numero_pago_ccdtr > 0 AND lb.ide_tecba = $1
              )
        `);
        query.addIntParam(1, ideTecba);
        query.addParam(2, ideCccfaList);
        query.addIntParam(3, dtoIn.ideEmpr);
        query.addIntParam(4, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Comisión (con IVA) que el procesador aplicó a los pagos indicados según su Excel de
     * liquidación. `completo` es falso si algún pago aún no tiene acreditación con esos valores
     * (no se puede verificar la factura de comisión contra la liquidación).
     */
    async getComisionLiquidadaPagos(ideCccfaList: number[]) {
        const query = new SelectQuery(`
            SELECT
                COUNT(*) AS acreditados,
                COALESCE(SUM(ROUND((f.valor_comision_tedtf + f.valor_iva_comision_tedtf) * 100)), 0) AS total_cents
            FROM tes_det_devol_cobro_tarjeta_fact f
            WHERE f.ide_cccfa = ANY($1)
              AND f.valor_comision_tedtf IS NOT NULL
              AND f.valor_iva_comision_tedtf IS NOT NULL
        `);
        query.addParam(1, ideCccfaList);
        const row = await this.dataSource.createSingleQuery(query);
        return {
            completo: Number(row?.acreditados ?? 0) === ideCccfaList.length,
            totalCents: Number(row?.total_cents ?? 0),
        };
    }

    /**
     * Datos de la factura de comisión (cxp_cabece_factur) necesarios para pagarla contra la
     * cuenta de tarjeta: su cuenta por pagar (ide_cpctr), si ya tiene asiento contable y su
     * proveedor.
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
     * Listado unificado de la página principal del módulo: acreditaciones (una transferencia del
     * procesador, incluidos los ciclos anteriores con comisión y retención juntas) y cortes (factura
     * de comisión y/o comprobante de retención). El filtro `tipo` decide qué ramas del UNION
     * aportan filas. El estado de una acreditación se deriva de los documentos que ya cubren sus pagos
     * (Acreditada / Parcial / Completa / Anulada, ver SQL_ESTADO_ACREDITACION); el de un corte es
     * Activo/Anulado.
     */
    async getDevolucionesTarjeta(dtoIn: GetDevolucionesTarjetaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT * FROM (
                SELECT
                    -- Primera columna = identidad de fila de la tabla (el backend la envía como key):
                    -- debe ser UNICA entre acreditaciones y cortes (antes era tipo, que se repite y
                    -- hacía que la tabla dibujara filas duplicadas).
                    'acreditacion-' || c.ide_tecdt::text AS id_registro,
                    'acreditacion'::text AS tipo,
                    c.fecha_tecdt AS fecha,
                    c.ide_tecdt,
                    NULL::bigint AS ide_tecct,
                    c.anulado_tecdt AS anulado,
                    ${SQL_ESTADO_ACREDITACION},
                    c.ide_tecba,
                    cb.nombre_tecba,
                    b.nombre_teban,
                    b.color_teban,
                    b.foto_teban,
                    p.nom_geper AS proveedor,
                    COALESCE(cf.numero_cpcfa, ti.num_comprobante_teincb) AS documento,
                    (SELECT COUNT(*) FROM tes_det_devol_cobro_tarjeta_fact d WHERE d.ide_tecdt = c.ide_tecdt) AS num_facturas,
                    c.valor_total_cobros_tecdt AS valor_cobrado,
                    CASE WHEN c.ide_cpcfa IS NOT NULL THEN c.valor_comision_tecdt + c.valor_iva_comision_tecdt
                         ELSE liq.comision + liq.iva_comision END AS valor_comision,
                    CASE WHEN c.ide_cpcfa IS NOT NULL THEN ret.iva + ret.renta
                         ELSE liq.ret_iva + liq.ret_renta END AS valor_retencion,
                    c.valor_neto_transferido_tecdt AS valor_neto_acreditado,
                    cbd.nombre_tecba AS nombre_tecba_destino
                FROM tes_cab_devol_cobro_tarjeta c
                INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = c.ide_tecba
                INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
                LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
                LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = c.ide_cpcfa
                LEFT JOIN tes_info_comprobante_banco ti ON ti.ide_teincb = c.ide_teincb
                LEFT JOIN tes_cuenta_banco cbd ON cbd.ide_tecba = c.ide_tecba_destino
                ${SQL_JOIN_RETENCION_CICLO}
                ${SQL_JOIN_LIQUIDACION_CICLO}
                ${SQL_JOIN_PROGRESO_ACREDITACION}
                WHERE $5::text IN ('todos', 'acreditacion')
                  AND c.ide_empr = $1
                  AND c.ide_sucu = $2
                  AND ($3::date IS NULL OR c.fecha_tecdt >= $3)
                  AND ($4::date IS NULL OR c.fecha_tecdt <= $4)

                UNION ALL

                SELECT
                    'corte-' || ct.ide_tecct::text AS id_registro,
                    'corte'::text AS tipo,
                    ct.fecha_tecct AS fecha,
                    NULL::bigint AS ide_tecdt,
                    ct.ide_tecct,
                    ct.anulado_tecct AS anulado,
                    CASE WHEN ct.anulado_tecct THEN 'Anulado' ELSE 'Activo' END AS estado,
                    CASE WHEN ct.anulado_tecct THEN 'error' ELSE 'success' END AS color_estado,
                    NULL::bigint AS pagos_sin_comision,
                    NULL::bigint AS pagos_sin_retencion,
                    ct.ide_tecba,
                    cb.nombre_tecba,
                    b.nombre_teban,
                    b.color_teban,
                    b.foto_teban,
                    p.nom_geper AS proveedor,
                    CONCAT_WS(' / ', cf.numero_cpcfa, r.numero_cncre) AS documento,
                    (SELECT COUNT(*) FROM tes_det_corte_tarjeta d WHERE d.ide_tecct = ct.ide_tecct) AS num_facturas,
                    (SELECT SUM(f.total_cccfa) FROM tes_det_corte_tarjeta d
                        INNER JOIN cxc_cabece_factura f ON f.ide_cccfa = d.ide_cccfa
                        WHERE d.ide_tecct = ct.ide_tecct) AS valor_cobrado,
                    cf.total_cpcfa AS valor_comision,
                    (SELECT SUM(d.valor_cndre) FROM con_detall_retenc d WHERE d.ide_cncre = ct.ide_cncre) AS valor_retencion,
                    NULL::numeric AS valor_neto_acreditado,
                    NULL::text AS nombre_tecba_destino
                FROM tes_cab_corte_tarjeta ct
                INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = ct.ide_tecba
                INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
                LEFT JOIN gen_persona p ON p.ide_geper = ct.ide_geper
                LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = ct.ide_cpcfa
                LEFT JOIN con_cabece_retenc r ON r.ide_cncre = ct.ide_cncre
                WHERE $5::text IN ('todos', 'corte')
                  AND ct.ide_empr = $1
                  AND ct.ide_sucu = $2
                  AND ($3::date IS NULL OR ct.fecha_tecct >= $3)
                  AND ($4::date IS NULL OR ct.fecha_tecct <= $4)
            ) x
            WHERE $6::text = 'todos'
               OR ($6::text = 'anulado' AND x.anulado)
               OR ($6::text <> 'anulado' AND NOT x.anulado AND LOWER(x.estado) = $6::text)
            ORDER BY x.fecha DESC, COALESCE(x.ide_tecdt, x.ide_tecct) DESC
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.fechaDesde ?? null);
        query.addParam(4, dtoIn.fechaHasta ?? null);
        query.addParam(5, dtoIn.tipo ?? 'todos');
        query.addParam(6, dtoIn.estado ?? 'todos');
        return this.dataSource.createQuery(query);
    }

    /**
     * Detalle de una acreditación: cabecera + pagos cubiertos con los valores del procesador. Para
     * un ciclo anterior (con factura de comisión) incluye además sus retenciones aplicadas.
     */
    async getDevolucionTarjetaById(ideTecdt: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                c.ide_tecdt,
                c.fecha_tecdt,
                c.anulado_tecdt,
                c.fecha_anula_tecdt,
                c.motivo_anula_tecdt,
                ${SQL_ESTADO_ACREDITACION},
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
                ti.num_comprobante_teincb,
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
                CASE WHEN c.ide_cpcfa IS NOT NULL THEN c.valor_comision_tecdt ELSE liq.comision END AS valor_comision_tecdt,
                CASE WHEN c.ide_cpcfa IS NOT NULL THEN c.valor_iva_comision_tecdt ELSE liq.iva_comision END AS valor_iva_comision_tecdt,
                CASE WHEN c.ide_cpcfa IS NOT NULL THEN ret.iva ELSE liq.ret_iva END AS valor_retencion_iva_tecdt,
                CASE WHEN c.ide_cpcfa IS NOT NULL THEN ret.renta ELSE liq.ret_renta END AS valor_retencion_renta_tecdt,
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
            ${SQL_JOIN_LIQUIDACION_CICLO}
            ${SQL_JOIN_PROGRESO_ACREDITACION}
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
                f.valor_comision_tedtf,
                f.valor_iva_comision_tedtf,
                f.valor_ret_iva_tedtf,
                f.valor_ret_renta_tedtf,
                f.numero_liquidacion_tedtf,
                cf.secuencial_cccfa,
                cf.fecha_emisi_cccfa,
                cf.ide_geper,
                p.nom_geper AS cliente,
                cf.ide_cncre,
                ${SQL_PAGO_REQUIERE_COMISION} AS requiere_comision,
                ${SQL_PAGO_CON_COMISION} AS con_comision,
                ${SQL_PAGO_REQUIERE_RETENCION} AS requiere_retencion,
                ${SQL_PAGO_CON_RETENCION} AS con_retencion
            FROM tes_det_devol_cobro_tarjeta_fact f
            INNER JOIN tes_cab_devol_cobro_tarjeta c ON c.ide_tecdt = f.ide_tecdt
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = f.ide_cccfa
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            WHERE f.ide_tecdt = $1
            ORDER BY cf.fecha_emisi_cccfa ASC, f.ide_cccfa ASC
        `);
        qDet.addIntParam(1, ideTecdt);
        const facturas = await this.dataSource.createSelectQuery(qDet);

        // Retenciones de un ciclo anterior (una fila por comprobante: el movimiento contable que la
        // descontó y, en detalles, su porción de las facturas del ciclo). Vacío en acreditaciones nuevas.
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

        return { ...cabecera, facturas, retenciones };
    }

    /**
     * Detalle de un corte: sus documentos (factura de comisión y/o comprobante de retención), los
     * pagos que cubre con la retención real por pago y lo que el procesador aplicó según su Excel
     * (si el pago ya está acreditado), y la conciliación de ambos documentos contra esa liquidación.
     */
    async getCorteTarjetaById(ideTecct: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                ct.ide_tecct,
                ct.fecha_tecct,
                ct.anulado_tecct,
                ct.fecha_anula_tecct,
                ct.motivo_anula_tecct,
                CASE WHEN ct.anulado_tecct THEN 'Anulado' ELSE 'Activo' END AS estado,
                CASE WHEN ct.anulado_tecct THEN 'error' ELSE 'success' END AS color_estado,
                ct.ide_tecba,
                cb.nombre_tecba,
                b.nombre_teban,
                b.color_teban,
                b.foto_teban,
                ct.ide_geper,
                p.nom_geper AS proveedor,
                ct.ide_cpcfa,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                cf.valor_iva_cpcfa,
                cf.ide_cnccc AS ide_cnccc_comision,
                lbp.ide_cnccc AS ide_cnccc_pago_comision,
                ct.ide_cncre,
                r.numero_cncre,
                r.autorizacion_cncre,
                r.fecha_emisi_cncre,
                lbr.ide_cnccc AS ide_cnccc_retencion,
                lbr.valor_teclb AS valor_retencion_contabilizada,
                (SELECT SUM(d.valor_cndre) FROM con_detall_retenc d WHERE d.ide_cncre = ct.ide_cncre) AS valor_retencion,
                ct.observacion_tecct
            FROM tes_cab_corte_tarjeta ct
            INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = ct.ide_tecba
            INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            LEFT JOIN gen_persona p ON p.ide_geper = ct.ide_geper
            LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = ct.ide_cpcfa
            LEFT JOIN tes_cab_libr_banc lbp ON lbp.ide_teclb = ct.ide_teclb_pago_comision
            LEFT JOIN con_cabece_retenc r ON r.ide_cncre = ct.ide_cncre
            LEFT JOIN tes_cab_libr_banc lbr ON lbr.ide_teclb = ct.ide_teclb_debito_retencion
            WHERE ct.ide_tecct = $1
              AND ct.ide_empr = $2
              AND ct.ide_sucu = $3
        `);
        qCab.addIntParam(1, ideTecct);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) return null;

        const qDet = new SelectQuery(`
            SELECT
                cf.ide_cccfa,
                cf.secuencial_cccfa,
                cf.fecha_emisi_cccfa,
                cf.total_cccfa,
                p.nom_geper AS cliente,
                COALESCE(cf.base_grabada_cccfa, 0) AS base_grabada_cccfa,
                COALESCE(cf.valor_iva_cccfa, 0) AS valor_iva_cccfa,
                (SELECT SUM(d.valor_cndre) FROM con_detall_retenc d
                    WHERE d.ide_cncre = cf.ide_cncre AND d.ide_cccfa = cf.ide_cccfa) AS valor_retencion,
                tf.ide_tecdt,
                tf.valor_comision_tedtf + tf.valor_iva_comision_tedtf AS comision_liquidada,
                tf.valor_ret_iva_tedtf + tf.valor_ret_renta_tedtf AS retencion_liquidada
            FROM tes_det_corte_tarjeta dc
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = dc.ide_cccfa
            LEFT JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            LEFT JOIN tes_det_devol_cobro_tarjeta_fact tf ON tf.ide_cccfa = cf.ide_cccfa
            WHERE dc.ide_tecct = $1
            ORDER BY cf.fecha_emisi_cccfa ASC, cf.ide_cccfa ASC
        `);
        qDet.addIntParam(1, ideTecct);
        const facturas = await this.dataSource.createSelectQuery(qDet);

        return { ...cabecera, facturas };
    }

    /**
     * Tablero de pagos con tarjeta (Ventas > Reportes > Cobros con Tarjeta): TODAS las facturas de
     * venta cobradas con una cuenta de tarjeta, con tres marcas independientes - acreditada,
     * con comisión y con retención - y los valores que el procesador aplicó a cada pago según su
     * Excel de liquidación. El valor de la retención es el REAL del comprobante (por factura), y la
     * diferencia compara lo que el procesador dijo retener contra lo que trae el comprobante.
     * Para un ciclo anterior sin Excel, la comisión se prorratea por peso dentro del ciclo.
     * El rango de fechas filtra por la fecha de emisión de la factura.
     */
    async getReporteCobrosTarjeta(dtoIn: GetReporteCobrosTarjetaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH pagos AS (
                SELECT
                    cf.ide_cccfa,
                    cf.secuencial_cccfa,
                    cf.fecha_emisi_cccfa,
                    cf.total_cccfa,
                    cf.ide_geper,
                    cf.ide_cncre,
                    MAX(lb.ide_tecba) AS ide_tecba,
                    SUM(dt.valor_ccdtr) AS valor_cobrado_tarjeta
                FROM cxc_detall_transa dt
                INNER JOIN tes_cab_libr_banc lb ON lb.ide_teclb = dt.ide_teclb
                INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = dt.ide_cccfa
                INNER JOIN tes_cuenta_banco cb0 ON cb0.ide_tecba = lb.ide_tecba
                INNER JOIN tes_banco b0 ON b0.ide_teban = cb0.ide_teban AND b0.es_tarjeta_teban = TRUE
                WHERE dt.numero_pago_ccdtr > 0
                  AND cf.ide_empr = $1
                  AND cf.ide_sucu = $2
                  AND ($3::date IS NULL OR cf.fecha_emisi_cccfa >= $3)
                  AND ($4::date IS NULL OR cf.fecha_emisi_cccfa <= $4)
                  AND ($5::bigint IS NULL OR lb.ide_tecba = $5)
                GROUP BY cf.ide_cccfa, cf.secuencial_cccfa, cf.fecha_emisi_cccfa, cf.total_cccfa,
                         cf.ide_geper, cf.ide_cncre
            ),
            detalle AS (
                SELECT
                    p.ide_cccfa,
                    p.secuencial_cccfa,
                    p.fecha_emisi_cccfa,
                    p.total_cccfa,
                    p.valor_cobrado_tarjeta,
                    cli.nom_geper AS cliente,
                    cli.identificac_geper,
                    p.ide_tecba,
                    cb.nombre_tecba,
                    b.nombre_teban,
                    b.foto_teban,
                    b.color_teban,
                    c.ide_tecdt,
                    c.fecha_tecdt,
                    tf.numero_liquidacion_tedtf AS numero_liquidacion,
                    dc.ide_tecct,
                    (c.ide_tecdt IS NOT NULL) AS acreditada,
                    (ct.ide_cpcfa IS NOT NULL OR c.ide_cpcfa IS NOT NULL) AS con_comision,
                    (p.ide_cncre IS NOT NULL) AS con_retencion,
                    -- Comisión por pago: la del Excel; en un ciclo anterior, prorrateo por peso
                    COALESCE(
                        tf.valor_comision_tedtf,
                        ROUND((c.valor_comision_tecdt * tf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2)
                    ) AS valor_comision,
                    COALESCE(
                        tf.valor_iva_comision_tedtf,
                        ROUND((c.valor_iva_comision_tecdt * tf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2)
                    ) AS valor_iva_comision,
                    ret.total AS valor_retencion,
                    tf.valor_ret_iva_tedtf + tf.valor_ret_renta_tedtf AS retencion_liquidada,
                    ROUND((c.valor_neto_transferido_tecdt * tf.valor_cccfa_tedtf / NULLIF(c.valor_total_cobros_tecdt, 0))::numeric, 2) AS valor_neto_acreditado
                FROM pagos p
                INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = p.ide_tecba
                INNER JOIN tes_banco b ON b.ide_teban = cb.ide_teban
                LEFT JOIN gen_persona cli ON cli.ide_geper = p.ide_geper
                LEFT JOIN tes_det_devol_cobro_tarjeta_fact tf ON tf.ide_cccfa = p.ide_cccfa
                LEFT JOIN tes_cab_devol_cobro_tarjeta c ON c.ide_tecdt = tf.ide_tecdt
                LEFT JOIN tes_det_corte_tarjeta dc ON dc.ide_cccfa = p.ide_cccfa
                LEFT JOIN tes_cab_corte_tarjeta ct ON ct.ide_tecct = dc.ide_tecct
                LEFT JOIN LATERAL (
                    SELECT SUM(d.valor_cndre) AS total
                    FROM con_detall_retenc d
                    WHERE d.ide_cncre = p.ide_cncre AND d.ide_cccfa = p.ide_cccfa
                ) ret ON p.ide_cncre IS NOT NULL
            ),
            base AS (
                SELECT
                    d.*,
                    CASE
                        WHEN d.acreditada AND d.con_comision AND d.con_retencion THEN 'Completo'
                        WHEN NOT d.acreditada AND NOT d.con_comision AND NOT d.con_retencion THEN 'Cobrado'
                        ELSE 'Parcial'
                    END AS estado,
                    CASE
                        WHEN d.acreditada AND d.con_comision AND d.con_retencion THEN 'success'
                        WHEN NOT d.acreditada AND NOT d.con_comision AND NOT d.con_retencion THEN 'default'
                        ELSE 'warning'
                    END AS color_estado,
                    -- Neto esperado del pago = cobro - comisión - retención (real si ya hay comprobante,
                    -- si no la del Excel); solo cuando el pago está acreditado y hay valores para calcularlo
                    CASE WHEN d.acreditada AND d.valor_comision IS NOT NULL THEN
                        d.valor_cobrado_tarjeta - d.valor_comision - COALESCE(d.valor_iva_comision, 0)
                            - COALESCE(d.valor_retencion, d.retencion_liquidada, 0)
                    END AS valor_neto_calculado,
                    -- Lo que el procesador dijo retener contra lo que trae el comprobante
                    CASE WHEN d.valor_retencion IS NOT NULL AND d.retencion_liquidada IS NOT NULL THEN
                        d.retencion_liquidada - d.valor_retencion
                    END AS diferencia_retencion
                FROM detalle d
            )
            SELECT b.*,
                   CASE WHEN b.valor_neto_calculado IS NOT NULL THEN b.valor_neto_acreditado - b.valor_neto_calculado END AS diferencia
            FROM base b
            WHERE ($6::boolean IS NOT TRUE
                   OR ABS(COALESCE(b.valor_neto_acreditado - b.valor_neto_calculado, 0)) > 0.01
                   OR ABS(COALESCE(b.diferencia_retencion, 0)) > 0.01)
            ORDER BY b.fecha_emisi_cccfa DESC, b.ide_cccfa DESC
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
