import { Injectable } from '@nestjs/common';
import { getYear } from 'date-fns';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { VentasMensualesDto } from '../../ventas/facturas/dto/ventas-mensuales.dto';
import { ProformasMensualesDto } from '../dto/proformas-mensuales.dto';
import { SucursalDto } from '../dto/sucursal.dto';
import { canalProformaSql } from '../proformas-canal.sql';

/**
 * Análisis de proformas (cotizaciones). Criterios comunes a todas las consultas:
 *  - Solo cuentan las proformas NO anuladas, salvo donde se indica lo contrario.
 *  - "Convertida" = tiene al menos una factura en estado normal cuyo `num_proforma_cccfa` es su secuencial. Las
 *    facturas se resumen UNA VEZ por proforma (CTE `fac`) antes de unirlas, para que una proforma con dos facturas no
 *    duplique el importe cotizado ni el conteo.
 *  - El cliente sale de `ide_geper`. Las proformas de "consumidor final" (portal web, WhatsApp sin cliente) se agrupan
 *    por el nombre del solicitante, no todas bajo una sola persona.
 */
@Injectable()
export class ProformasBiService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    // obtiene las variables del sistema para el servicio
    this.core
      .getVariables([
        'p_cxc_estado_factura_normal', // 0
        'p_con_tipo_documento_factura', // 3
        'p_inv_estado_normal', // 1
        'p_cxp_estado_factura_normal', //0
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  // ───────────────────────────── helpers SQL ─────────────────────────────

  /** `AND <alias>.ide_sucu = ANY(...)` si se pidieron sucursales; vacío si no. */
  private whereSucursal(dtoIn: { ide_sucu?: number[] | number }, alias: string): string {
    if (!isDefined(dtoIn.ide_sucu)) return '';
    const lista = (Array.isArray(dtoIn.ide_sucu) ? dtoIn.ide_sucu : [dtoIn.ide_sucu])
      .map(Number)
      .filter((s) => Number.isInteger(s));
    return lista.length ? `AND ${alias}.ide_sucu = ANY (ARRAY[${lista.join(',')}]::INT[])` : '';
  }

  /** CTE `fac`: una fila por proforma convertida (por secuencial) con lo facturado en total. */
  private cteFacturas(ideEmpr: number | string): string {
    const normal = Number(this.variables.get('p_cxc_estado_factura_normal'));
    return `fac AS (
      SELECT f.num_proforma_cccfa                 AS secuencial,
             COUNT(*)                             AS num_facturas,
             SUM(f.total_cccfa)                   AS total_facturado,
             MIN(f.fecha_emisi_cccfa)             AS primera_factura
        FROM cxc_cabece_factura f
       WHERE f.ide_ccefa = ${normal}
         AND f.ide_empr  = ${Number(ideEmpr)}
         AND f.num_proforma_cccfa IS NOT NULL
       GROUP BY f.num_proforma_cccfa
    )`;
  }

  /** Nombre y clave de cliente de una proforma `c` unida a `p` (gen_persona por ide_geper). */
  private readonly clienteNombre = `CASE WHEN p.ide_geper IS NULL OR p.identificac_geper = '9999999999999'
        THEN COALESCE(NULLIF(TRIM(c.solicitante_cccpr), ''), 'CONSUMIDOR FINAL') ELSE p.nom_geper END`;

  private readonly clienteClave = `CASE WHEN p.ide_geper IS NULL OR p.identificac_geper = '9999999999999'
        THEN 'S:' || UPPER(TRIM(COALESCE(c.solicitante_cccpr, ''))) ELSE 'P:' || p.ide_geper END`;

  // ───────────────────────────── tendencias ─────────────────────────────

  /**
   * Cotizaciones por mes de un año, agrupadas por el mes en que se COTIZÓ (no por el mes de la factura): así "efectivas"
   * son las cotizaciones de ese mes que llegaron a facturarse, aunque se hayan facturado después.
   */
  async getProformasMensuales(dtoIn: ProformasMensualesDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
    }
    const query = new SelectQuery(`
        WITH ${this.cteFacturas(dtoIn.ideEmpr)},
        proformas_mes AS (
            SELECT
                EXTRACT(MONTH FROM c.fecha_cccpr)                 AS mes,
                COUNT(*)                                          AS num_proformas,
                SUM(c.total_cccpr)                                AS total_cotizado,
                COUNT(fac.secuencial)                             AS cotizaciones_efectivas,
                COALESCE(SUM(fac.total_facturado), 0)             AS total_facturado
            FROM cxc_cabece_proforma c
            LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
            WHERE c.fecha_cccpr BETWEEN $1 AND $2
              AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
              AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
              ${this.whereSucursal(dtoIn, 'c')}
            GROUP BY EXTRACT(MONTH FROM c.fecha_cccpr)
        )
        SELECT
            gm.nombre_gemes,
            ${Number(dtoIn.periodo)} AS periodo,
            COALESCE(pm.num_proformas, 0)          AS proformas_realizadas,
            COALESCE(pm.total_cotizado, 0)         AS total_cotizado,
            COALESCE(pm.cotizaciones_efectivas, 0) AS cotizaciones_efectivas,
            COALESCE(pm.total_facturado, 0)        AS total_facturado,
            CASE WHEN COALESCE(pm.num_proformas, 0) = 0 THEN 0
                 ELSE ROUND(pm.cotizaciones_efectivas::numeric / pm.num_proformas * 100, 2)
            END AS porcentaje_efectivo
        FROM gen_mes gm
        LEFT JOIN proformas_mes pm ON gm.ide_gemes = pm.mes
        ORDER BY gm.ide_gemes
        `);
    query.addStringParam(1, `${dtoIn.periodo}-01-01`);
    query.addStringParam(2, `${dtoIn.periodo}-12-31`);
    return this.dataSource.createQuery(query);
  }

  /** Cotizaciones por día del rango, incluyendo los días sin cotizaciones (en cero) para que la línea sea continua. */
  async getTendenciaDiaria(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    SELECT
        d.dia::date                                   AS fecha,
        COALESCE(x.cantidad_cotizaciones, 0)          AS cantidad_cotizaciones,
        COALESCE(x.valor_total, 0)                    AS valor_total
    FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS d(dia)
    LEFT JOIN (
        SELECT c.fecha_cccpr AS fecha, COUNT(*) AS cantidad_cotizaciones, SUM(c.total_cccpr) AS valor_total
          FROM cxc_cabece_proforma c
         WHERE c.fecha_cccpr BETWEEN $3 AND $4
           AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
           AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
           ${this.whereSucursal(dtoIn, 'c')}
         GROUP BY c.fecha_cccpr
    ) x ON x.fecha = d.dia::date
    ORDER BY d.dia
    `);
    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  /** Variación mensual (cantidad y valor) del año anterior y el actual; los meses sin cotizaciones cuentan como cero. */
  async getVariacionCotizaciones(dtoIn: SucursalDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    WITH meses AS (
        SELECT date_trunc('month', m)::date AS mes
          FROM generate_series(
                 (date_trunc('year', CURRENT_DATE) - INTERVAL '1 year')::date,
                 date_trunc('month', CURRENT_DATE)::date,
                 INTERVAL '1 month') AS m
    ),
    cotizaciones_mensuales AS (
        SELECT date_trunc('month', c.fecha_cccpr)::date AS mes,
               COUNT(*) AS cantidad,
               SUM(c.total_cccpr) AS valor_total
          FROM cxc_cabece_proforma c
         WHERE c.fecha_cccpr >= (date_trunc('year', CURRENT_DATE) - INTERVAL '1 year')::date
           AND c.fecha_cccpr <= CURRENT_DATE
           AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
           AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
           ${this.whereSucursal(dtoIn, 'c')}
         GROUP BY 1
    ),
    serie AS (
        SELECT m.mes,
               COALESCE(cm.cantidad, 0)    AS cantidad,
               COALESCE(cm.valor_total, 0) AS valor_total
          FROM meses m
          LEFT JOIN cotizaciones_mensuales cm ON cm.mes = m.mes
    )
    SELECT
        EXTRACT(YEAR FROM mes)::int  AS año,
        EXTRACT(MONTH FROM mes)::int AS mes,
        cantidad,
        valor_total,
        LAG(cantidad)    OVER (ORDER BY mes) AS cantidad_mes_anterior,
        LAG(valor_total) OVER (ORDER BY mes) AS valor_mes_anterior,
        ROUND((cantidad - LAG(cantidad) OVER (ORDER BY mes))::numeric
              / NULLIF(LAG(cantidad) OVER (ORDER BY mes), 0) * 100, 2) AS variacion_cantidad,
        ROUND((valor_total - LAG(valor_total) OVER (ORDER BY mes))::numeric
              / NULLIF(LAG(valor_total) OVER (ORDER BY mes), 0) * 100, 2) AS variacion_valor
    FROM serie
    ORDER BY mes
`);
    return this.dataSource.createQuery(query);
  }

  // ───────────────────────────── productos ─────────────────────────────

  // 1. Productos más cotizados (Top 10)
  async getTopProductos(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        SELECT
            a.ide_inarti,
            b.nombre_inarti,
            f.siglas_inuni,
            COUNT(DISTINCT c.ide_cccpr) AS veces_cotizado,
            SUM(a.cantidad_ccdpr) AS cantidad_total,
            SUM(a.total_ccdpr) AS valor_total,
            ROUND(AVG(a.utilidad_ccdpr), 2) AS utilidad_promedio
        FROM
            cxc_deta_proforma a
            INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
            INNER JOIN cxc_cabece_proforma c ON a.ide_cccpr = c.ide_cccpr
            LEFT JOIN inv_unidad f ON b.ide_inuni = f.ide_inuni
        WHERE
            c.fecha_cccpr BETWEEN $1 AND $2
            AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
            AND c.ide_empr  = ${Number(dtoIn.ideEmpr)}
            AND b.hace_kardex_inarti = TRUE
            ${this.whereSucursal(dtoIn, 'c')}
        GROUP BY a.ide_inarti, b.nombre_inarti, f.siglas_inuni
        ORDER BY veces_cotizado DESC
        LIMIT 10
        `);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // 2. Productos con mayor utilidad
  async getTopProductosMayorUtilidad(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        SELECT
            a.ide_inarti,
            b.nombre_inarti,
            f.siglas_inuni,
            SUM(a.utilidad_ccdpr) AS utilidad_total,
            SUM(a.total_ccdpr) AS valor_total,
            ROUND((SUM(a.utilidad_ccdpr) / NULLIF(SUM(a.total_ccdpr), 0)) * 100, 2) AS margen_utilidad
        FROM
            cxc_deta_proforma a
        INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
        INNER JOIN cxc_cabece_proforma c ON a.ide_cccpr = c.ide_cccpr
        LEFT JOIN inv_unidad f ON b.ide_inuni = f.ide_inuni
        WHERE
            c.fecha_cccpr BETWEEN $1 AND $2
            AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
            AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
            AND a.utilidad_ccdpr IS NOT NULL
            ${this.whereSucursal(dtoIn, 'c')}
        GROUP BY a.ide_inarti, b.nombre_inarti, f.siglas_inuni
        ORDER BY utilidad_total DESC NULLS LAST
        LIMIT 10
        `);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // ───────────────────────────── vendedores ─────────────────────────────

  // 3. Efectividad por vendedor
  async getEfectividadPorVendedor(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        WITH ${this.cteFacturas(dtoIn.ideEmpr)}
        SELECT
            COALESCE(v.nombre_vgven, 'Sin Vendedor')            AS vendedor,
            COUNT(*)                                            AS total_cotizaciones,
            COUNT(fac.secuencial)                               AS cotizaciones_efectivas,
            COALESCE(SUM(c.total_cccpr), 0)                     AS monto_cotizado,
            COALESCE(SUM(fac.total_facturado), 0)               AS monto_facturado,
            ROUND(COUNT(fac.secuencial)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS porcentaje_efectividad
        FROM cxc_cabece_proforma c
        LEFT JOIN ven_vendedor v ON c.ide_vgven = v.ide_vgven
        LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
        WHERE c.fecha_cccpr BETWEEN $1 AND $2
          AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
          AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
          ${this.whereSucursal(dtoIn, 'c')}
        GROUP BY v.ide_vgven, v.nombre_vgven
        ORDER BY total_cotizaciones DESC
        `);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // 3b. Vendedores activos (con al menos una proforma) por mes de un año
  async getVendedoresMensuales(dtoIn: ProformasMensualesDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
    }
    const query = new SelectQuery(`
        WITH vendedores_mes AS (
            SELECT
                EXTRACT(MONTH FROM c.fecha_cccpr) AS mes,
                COUNT(DISTINCT c.ide_vgven) AS vendedores_activos,
                COUNT(DISTINCT c.ide_cccpr) AS total_cotizaciones
            FROM cxc_cabece_proforma c
            WHERE EXTRACT(YEAR FROM c.fecha_cccpr) = $1
              AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
              AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
              AND c.ide_vgven IS NOT NULL
              ${this.whereSucursal(dtoIn, 'c')}
            GROUP BY EXTRACT(MONTH FROM c.fecha_cccpr)
        )
        SELECT
            gm.ide_gemes,
            gm.nombre_gemes,
            COALESCE(vm.vendedores_activos, 0) AS vendedores_activos,
            COALESCE(vm.total_cotizaciones, 0) AS total_cotizaciones
        FROM gen_mes gm
        LEFT JOIN vendedores_mes vm ON gm.ide_gemes = vm.mes
        ORDER BY gm.ide_gemes
        `);
    query.addIntParam(1, dtoIn.periodo);
    return this.dataSource.createQuery(query);
  }

  // ───────────────────────────── clientes ─────────────────────────────

  //5. Clientes que más cotizan (Top 10)
  async getTopClientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        WITH ${this.cteFacturas(dtoIn.ideEmpr)}
        SELECT
            MAX(p.ide_geper)                                   AS ide_geper,
            ${this.clienteNombre}                              AS nom_geper,
            COUNT(*)                                           AS veces_cotizado,
            COALESCE(SUM(c.total_cccpr), 0)                    AS valor_total,
            COUNT(fac.secuencial)                              AS cotizaciones_efectivas
        FROM cxc_cabece_proforma c
        LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
        LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
        WHERE c.fecha_cccpr BETWEEN $1 AND $2
          AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
          AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
          ${this.whereSucursal(dtoIn, 'c')}
        GROUP BY ${this.clienteClave}, ${this.clienteNombre}
        ORDER BY veces_cotizado DESC, valor_total DESC
        LIMIT 10
    `);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  //1. Segmentación de Clientes por Comportamiento
  async getComportamientoClientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
    WITH ${this.cteFacturas(dtoIn.ideEmpr)},
    clientes_cotizaciones AS (
        SELECT
            ${this.clienteNombre}                        AS nom_geper,
            COUNT(*)                                     AS total_cotizaciones,
            COUNT(fac.secuencial)                        AS cotizaciones_efectivas,
            COALESCE(SUM(c.total_cccpr), 0)              AS monto_total_cotizado,
            COALESCE(SUM(fac.total_facturado), 0)        AS monto_total_facturado
        FROM cxc_cabece_proforma c
        LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
        LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
        WHERE c.fecha_cccpr BETWEEN $1 AND $2
          AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
          AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
          ${this.whereSucursal(dtoIn, 'c')}
        GROUP BY ${this.clienteClave}, ${this.clienteNombre}
    )
    SELECT
        nom_geper AS cliente,
        total_cotizaciones,
        cotizaciones_efectivas,
        monto_total_cotizado,
        monto_total_facturado,
        ROUND((cotizaciones_efectivas::numeric / NULLIF(total_cotizaciones, 0)) * 100, 2) AS tasa_conversion,
        CASE
            WHEN cotizaciones_efectivas = 0 THEN 'Solo cotiza'
            WHEN (cotizaciones_efectivas::numeric / total_cotizaciones) < 0.3 THEN 'Baja conversión'
            WHEN (cotizaciones_efectivas::numeric / total_cotizaciones) <= 0.7 THEN 'Conversión media'
            ELSE 'Alta conversión'
        END AS segmento_cliente
    FROM clientes_cotizaciones
    ORDER BY monto_total_facturado DESC NULLS LAST, total_cotizaciones DESC`,
      dtoIn,
    );
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // 5. Histórico de Conversión por Cliente
  async getHisConversionPorCliente(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        WITH ${this.cteFacturas(dtoIn.ideEmpr)}
        SELECT
            MAX(p.ide_geper)                                   AS ide_geper,
            ${this.clienteNombre}                              AS cliente,
            EXTRACT(YEAR FROM c.fecha_cccpr)                   AS año,
            EXTRACT(MONTH FROM c.fecha_cccpr)                  AS mes,
            COUNT(*)                                           AS cotizaciones,
            COUNT(fac.secuencial)                              AS conversiones,
            ROUND(COUNT(fac.secuencial)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS tasa_conversion,
            COALESCE(SUM(c.total_cccpr), 0)                    AS monto_cotizado,
            COALESCE(SUM(fac.total_facturado), 0)              AS monto_facturado
        FROM cxc_cabece_proforma c
        LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
        LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
        WHERE c.fecha_cccpr BETWEEN $1 AND $2
          AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
          AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
          ${this.whereSucursal(dtoIn, 'c')}
        GROUP BY ${this.clienteClave}, ${this.clienteNombre},
                 EXTRACT(YEAR FROM c.fecha_cccpr), EXTRACT(MONTH FROM c.fecha_cccpr)
        ORDER BY cliente, año, mes`,
      dtoIn,
    );
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // ───────────────────────────── conversión ─────────────────────────────

  // 6. Tiempo de conversión (cotización → primera factura)
  async getTiempoConversion(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        WITH ${this.cteFacturas(dtoIn.ideEmpr)}
        SELECT
            f_redondeo(AVG((fac.primera_factura - c.fecha_cccpr)::int), 2) AS dias_promedio_conversion,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (fac.primera_factura - c.fecha_cccpr)::int) AS mediana_dias_conversion,
            COUNT(*) FILTER (WHERE fac.primera_factura = c.fecha_cccpr) AS convertidas_mismo_dia,
            COUNT(*) AS convertidas
        FROM cxc_cabece_proforma c
        INNER JOIN fac ON fac.secuencial = c.secuencial_cccpr
        WHERE c.fecha_cccpr BETWEEN $1 AND $2
          AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
          AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
          ${this.whereSucursal(dtoIn, 'c')}
    `);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // 7. Resumen ejecutivo del rango (indicadores principales)
  async getResumenCotizaciones(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    WITH ${this.cteFacturas(dtoIn.ideEmpr)}
    SELECT
        COUNT(*)                                                             AS total_cotizaciones,
        COUNT(*) FILTER (WHERE COALESCE(c.anulado_cccpr, FALSE))             AS cotizaciones_anuladas,
        COUNT(*) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE))         AS cotizaciones_validas,
        COUNT(*) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE) AND COALESCE(c.enviado_cccpr, FALSE)) AS cotizaciones_enviadas,
        COUNT(fac.secuencial) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE)) AS cotizaciones_convertidas,
        COUNT(*) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE) AND fac.secuencial IS NULL) AS cotizaciones_pendientes,
        ROUND(COUNT(fac.secuencial) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE))::numeric
              / NULLIF(COUNT(*) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE)), 0) * 100, 2) AS tasa_conversion,
        COALESCE(SUM(c.total_cccpr) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE)), 0) AS monto_cotizado,
        COALESCE(SUM(c.total_cccpr) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE) AND fac.secuencial IS NULL), 0) AS monto_pendiente,
        COALESCE(SUM(fac.total_facturado) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE)), 0) AS monto_facturado,
        COALESCE(SUM(c.utilidad_cccpr) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE)), 0) AS utilidad_potencial,
        ROUND(AVG(c.total_cccpr) FILTER (WHERE NOT COALESCE(c.anulado_cccpr, FALSE)), 2) AS ticket_promedio
    FROM cxc_cabece_proforma c
    LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
    WHERE c.fecha_cccpr BETWEEN $1 AND $2
      AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
      ${this.whereSucursal(dtoIn, 'c')}
`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // Cotizaciones pendientes de seguimiento (no convertidas), de la más antigua a la más reciente
  async getCotizacionesPendientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    SELECT
        c.ide_cccpr,
        c.secuencial_cccpr,
        c.fecha_cccpr,
        ${this.clienteNombre}                    AS cliente,
        v.nombre_vgven                           AS vendedor,
        ${canalProformaSql('c')}                 AS canal,
        c.total_cccpr,
        CURRENT_DATE - c.fecha_cccpr             AS dias_pendientes,
        COALESCE(u.nom_usua, 'SIN ASIGNAR')      AS creador,
        c.observacion_cccpr
    FROM cxc_cabece_proforma c
    LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
    LEFT JOIN ven_vendedor v ON c.ide_vgven = v.ide_vgven
    LEFT JOIN sis_usuario u ON c.ide_usua = u.ide_usua
    WHERE c.fecha_cccpr BETWEEN $1 AND $2
      AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
      AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
      ${this.whereSucursal(dtoIn, 'c')}
      AND NOT EXISTS (
          SELECT 1 FROM cxc_cabece_factura f
          WHERE f.num_proforma_cccfa = c.secuencial_cccpr
            AND f.ide_ccefa = ${Number(this.variables.get('p_cxc_estado_factura_normal'))}
            AND f.ide_empr = c.ide_empr
      )
    ORDER BY dias_pendientes DESC`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  /** Antigüedad de las cotizaciones sin facturar: cuántas y cuánto dinero hay en cada tramo de días. */
  async getEnvejecimientoPendientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    WITH ${this.cteFacturas(dtoIn.ideEmpr)},
    pendientes AS (
        SELECT c.total_cccpr, (CURRENT_DATE - c.fecha_cccpr) AS dias
          FROM cxc_cabece_proforma c
          LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
         WHERE c.fecha_cccpr BETWEEN $1 AND $2
           AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
           AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
           ${this.whereSucursal(dtoIn, 'c')}
           AND fac.secuencial IS NULL
    ),
    tramos AS (
        SELECT * FROM (VALUES
            (1, '0 a 7 días',   0,   7),
            (2, '8 a 15 días',  8,   15),
            (3, '16 a 30 días', 16,  30),
            (4, '31 a 60 días', 31,  60),
            (5, 'Más de 60 días', 61, 100000)
        ) AS t(orden, tramo, desde, hasta)
    )
    SELECT t.orden, t.tramo,
           COUNT(p.dias)                     AS cotizaciones,
           COALESCE(SUM(p.total_cccpr), 0)   AS monto
      FROM tramos t
      LEFT JOIN pendientes p ON p.dias BETWEEN t.desde AND t.hasta
     GROUP BY t.orden, t.tramo
     ORDER BY t.orden
    `);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // 3. Análisis de Pérdidas (cotizaciones no convertidas), por mes
  async getAnalisisPerdidas(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    WITH ${this.cteFacturas(dtoIn.ideEmpr)},
    base AS (
        SELECT c.*, ${this.clienteNombre} AS cliente_nombre, (fac.secuencial IS NULL) AS perdida
          FROM cxc_cabece_proforma c
          LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
          LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
         WHERE c.fecha_cccpr BETWEEN $1 AND $2
           AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
           AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
           ${this.whereSucursal(dtoIn, 'c')}
    )
    SELECT
        EXTRACT(MONTH FROM fecha_cccpr) AS mes,
        EXTRACT(YEAR FROM fecha_cccpr)  AS anio,
        COUNT(*) FILTER (WHERE perdida) AS cotizaciones_perdidas,
        COALESCE(SUM(total_cccpr) FILTER (WHERE perdida), 0) AS valor_perdido,
        STRING_AGG(DISTINCT cliente_nombre, ', ' ORDER BY cliente_nombre) FILTER (WHERE perdida) AS clientes_afectados,
        ROUND(COUNT(*) FILTER (WHERE perdida)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS porcentaje_perdidas
    FROM base
    GROUP BY EXTRACT(MONTH FROM fecha_cccpr), EXTRACT(YEAR FROM fecha_cccpr)
    HAVING COUNT(*) FILTER (WHERE perdida) > 0
    ORDER BY 2, 1
`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // 4. Efectividad por tipo de cotización
  async getEfectividadPorTipo(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    WITH ${this.cteFacturas(dtoIn.ideEmpr)}
    SELECT
        c.ide_cctpr,
        t.nombre_cctpr                                       AS tipo_producto,
        COUNT(*)                                             AS total_cotizaciones,
        COUNT(fac.secuencial)                                AS cotizaciones_efectivas,
        ROUND(COUNT(fac.secuencial)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS tasa_conversion,
        COALESCE(SUM(c.total_cccpr), 0)                      AS valor_cotizado,
        COALESCE(SUM(fac.total_facturado), 0)                AS valor_facturado
    FROM cxc_cabece_proforma c
    LEFT JOIN cxc_tipo_proforma t ON c.ide_cctpr = t.ide_cctpr
    LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
    WHERE c.fecha_cccpr BETWEEN $1 AND $2
      AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
      AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
      ${this.whereSucursal(dtoIn, 'c')}
    GROUP BY c.ide_cctpr, t.nombre_cctpr
    ORDER BY tasa_conversion DESC NULLS LAST`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // ───────────────────────── canal, provincia y horarios ─────────────────────────

  /** Cotizaciones por canal de origen (WhatsApp, página web, manual…): cantidad, valor y conversión. */
  async getCotizacionesPorCanal(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    WITH ${this.cteFacturas(dtoIn.ideEmpr)}
    SELECT
        ${canalProformaSql('c')}                                                   AS canal,
        COUNT(*)                                                                   AS total_cotizaciones,
        COALESCE(SUM(c.total_cccpr), 0)                                            AS monto_cotizado,
        COUNT(fac.secuencial)                                                      AS cotizaciones_efectivas,
        COALESCE(SUM(fac.total_facturado), 0)                                      AS monto_facturado,
        ROUND(COUNT(fac.secuencial)::numeric / NULLIF(COUNT(*), 0) * 100, 2)       AS tasa_conversion,
        ROUND(AVG(c.total_cccpr), 2)                                               AS ticket_promedio
    FROM cxc_cabece_proforma c
    LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
    WHERE c.fecha_cccpr BETWEEN $1 AND $2
      AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
      AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
      ${this.whereSucursal(dtoIn, 'c')}
    GROUP BY 1
    ORDER BY monto_cotizado DESC`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  /** Cotizaciones por mes y canal (para ver cómo evoluciona cada canal en el tiempo). */
  async getCotizacionesPorCanalMensual(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    SELECT
        to_char(date_trunc('month', c.fecha_cccpr), 'YYYY-MM') AS mes,
        ${canalProformaSql('c')}                               AS canal,
        COUNT(*)                                               AS cotizaciones,
        COALESCE(SUM(c.total_cccpr), 0)                        AS monto
    FROM cxc_cabece_proforma c
    WHERE c.fecha_cccpr BETWEEN $1 AND $2
      AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
      AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
      ${this.whereSucursal(dtoIn, 'c')}
    GROUP BY 1, 2
    ORDER BY 1, 2`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  /** Cotizaciones por provincia (la de la proforma o, si no tiene, la de su cliente) para el mapa. */
  async getCotizacionesPorProvincia(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    WITH ${this.cteFacturas(dtoIn.ideEmpr)}
    SELECT
        pr.ide_geprov,
        COALESCE(pr.nombre_geprov, 'Sin provincia')          AS provincia,
        COUNT(*)                                             AS cotizaciones,
        COALESCE(SUM(x.total_cccpr), 0)                      AS total_cotizado,
        COUNT(*) FILTER (WHERE x.convertida)                 AS convertidas
    FROM (
        SELECT COALESCE(c.ide_geprov, p.ide_geprov, d.ide_geprov) AS ide_geprov,
               c.total_cccpr,
               (fac.secuencial IS NOT NULL) AS convertida
          FROM cxc_cabece_proforma c
          LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
          LEFT JOIN LATERAL (
              SELECT dp.ide_geprov
                FROM gen_direccion_persona dp
               WHERE dp.ide_geper = c.ide_geper AND COALESCE(dp.activo_gedirp, TRUE) AND dp.ide_geprov IS NOT NULL
               ORDER BY dp.defecto_gedirp DESC NULLS LAST, dp.ide_gedirp DESC
               LIMIT 1
          ) d ON TRUE
          LEFT JOIN fac ON fac.secuencial = c.secuencial_cccpr
         WHERE c.fecha_cccpr BETWEEN $1 AND $2
           AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
           AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
           ${this.whereSucursal(dtoIn, 'c')}
    ) x
    LEFT JOIN gen_provincia pr ON pr.ide_geprov = x.ide_geprov
    GROUP BY pr.ide_geprov, pr.nombre_geprov
    ORDER BY total_cotizado DESC`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  /** Cuándo se cotiza: cotizaciones por día de la semana (0 = domingo) y hora, para un mapa de calor. */
  async getCotizacionesPorHorario(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    SELECT
        EXTRACT(DOW FROM c.fecha_cccpr)::int   AS dia_semana,
        EXTRACT(HOUR FROM c.hora_ingre)::int   AS hora,
        COUNT(*)                               AS cotizaciones,
        COALESCE(SUM(c.total_cccpr), 0)        AS monto
    FROM cxc_cabece_proforma c
    WHERE c.fecha_cccpr BETWEEN $1 AND $2
      AND COALESCE(c.anulado_cccpr, FALSE) = FALSE
      AND c.hora_ingre IS NOT NULL
      AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
      ${this.whereSucursal(dtoIn, 'c')}
    GROUP BY 1, 2
    ORDER BY 1, 2`);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  // ───────────────────────────── por producto ─────────────────────────────

  /** Retorna el total de PROFORMAS mensuales de un producto en un periodo */
  async getProformasMensualesProducto(dtoIn: VentasMensualesDto & HeaderParamsDto) {
    if (dtoIn.periodo === 0) {
      dtoIn.periodo = getYear(new Date());
      dtoIn.ide_inarti = -1;
    }
    const query = new SelectQuery(
      `
        WITH
        proformas_mes AS (
            SELECT
                EXTRACT(MONTH FROM a.fecha_cccpr) AS mes,
                COUNT(DISTINCT a.ide_cccpr) AS num_proformas,
                SUM(cdf.cantidad_ccdpr) AS cantidad_cotizada,
                SUM(cdf.total_ccdpr) AS total_cotizado,
                MAX(f.siglas_inuni) AS siglas_inuni
            FROM cxc_cabece_proforma a
            INNER JOIN cxc_deta_proforma cdf ON a.ide_cccpr = cdf.ide_cccpr
            INNER JOIN inv_articulo d ON cdf.ide_inarti = d.ide_inarti
            LEFT JOIN inv_unidad f ON d.ide_inuni = f.ide_inuni
            WHERE a.fecha_cccpr BETWEEN $1 AND $2
              AND cdf.ide_inarti = $3
              AND COALESCE(a.anulado_cccpr, FALSE) = FALSE
              AND a.ide_empr = ${Number(dtoIn.ideEmpr)}
            GROUP BY EXTRACT(MONTH FROM a.fecha_cccpr)
        ),
        facturas_efectivas AS (
            SELECT
                EXTRACT(MONTH FROM c.fecha_emisi_cccfa) AS mes,
                COUNT(DISTINCT c.ide_cccfa) AS cotizaciones_efectivas,
                SUM(d.cantidad_ccdfa) AS cantidad_efectiva
            FROM cxc_cabece_factura c
            INNER JOIN cxc_deta_factura d ON c.ide_cccfa = d.ide_cccfa
            WHERE c.fecha_emisi_cccfa BETWEEN $4 AND $5
              AND d.ide_inarti = $6
              AND c.ide_ccefa = ${Number(this.variables.get('p_cxc_estado_factura_normal'))}
              AND c.ide_empr = ${Number(dtoIn.ideEmpr)}
              AND c.num_proforma_cccfa IS NOT NULL
            GROUP BY EXTRACT(MONTH FROM c.fecha_emisi_cccfa)
        )
        SELECT
            gm.nombre_gemes,
            ${Number(dtoIn.periodo)} AS periodo,
            COALESCE(pm.num_proformas, 0) AS num_proformas,
            COALESCE(pm.cantidad_cotizada, 0) AS cantidad,
            COALESCE(pm.siglas_inuni, '') AS siglas_inuni,
            COALESCE(pm.total_cotizado, 0) AS total,
            COALESCE(fe.cotizaciones_efectivas, 0) AS cotizaciones_efectivas,
            COALESCE(fe.cantidad_efectiva, 0) AS cantidad_efectiva,
            CASE
                WHEN COALESCE(pm.cantidad_cotizada, 0) = 0 THEN 0
                ELSE ROUND((COALESCE(fe.cantidad_efectiva, 0)::numeric / NULLIF(pm.cantidad_cotizada, 0)::numeric) * 100, 2)
            END AS porcentaje_efectividad
        FROM gen_mes gm
        LEFT JOIN proformas_mes pm ON gm.ide_gemes = pm.mes
        LEFT JOIN facturas_efectivas fe ON gm.ide_gemes = fe.mes
        ORDER BY gm.ide_gemes
        `,
      dtoIn,
    );
    query.addStringParam(1, `${dtoIn.periodo}-01-01`);
    query.addStringParam(2, `${dtoIn.periodo}-12-31`);
    query.addIntParam(3, dtoIn.ide_inarti);
    query.addStringParam(4, `${dtoIn.periodo}-01-01`);
    query.addStringParam(5, `${dtoIn.periodo}-12-31`);
    query.addIntParam(6, dtoIn.ide_inarti);

    return this.dataSource.createQuery(query);
  }
}
