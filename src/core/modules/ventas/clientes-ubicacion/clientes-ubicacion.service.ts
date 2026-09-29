import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetClientesUbicacionDto } from './dto/get-clientes-ubicacion.dto';

const MESES_VALIDOS = [3, 6, 12, 24];

/** Rango de coordenadas del Ecuador, Galápagos incluido (lat -5.2..1.7, lon -92.3..-74.8). */
const RANGO_LAT = '-5.2 AND 1.7';
const RANGO_LON = '-92.3 AND -74.8';
/** Máximo de puntos que se envían al mapa. */
const MAX_PUNTOS = 8000;

/**
 * Coordenada guardada como texto → número; NULL si no es un número (acepta coma decimal). La validación por
 * expresión regular va dentro del CASE: un texto como "abc" no llega nunca al ::numeric (que haría fallar todo el query).
 */
const numeroGps = (col: string) =>
  `CASE WHEN replace(trim(${col}), ',', '.') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN replace(trim(${col}), ',', '.')::numeric END`;

/** Distancia en km (haversine) entre dos puntos; NULL si falta alguna coordenada. */
const sqlDistanciaKm = (lat1: string, lon1: string, lat2: string, lon2: string) =>
  `CASE WHEN ${lat1} IS NULL OR ${lon1} IS NULL OR ${lat2} IS NULL OR ${lon2} IS NULL THEN NULL
        ELSE ROUND((6371 * 2 * ASIN(LEAST(1, SQRT(
          POWER(SIN(RADIANS((${lat1} - ${lat2}) / 2)), 2) +
          COS(RADIANS(${lat2})) * COS(RADIANS(${lat1})) * POWER(SIN(RADIANS((${lon1} - ${lon2}) / 2)), 2)
        ))))::numeric, 1) END`;

/**
 * Clientes por ubicación (provincia / cantón): cuántos clientes hay en cada lugar, cuánto se les factura y
 * cómo se les envía la mercadería.
 *
 * - Cliente = gen_persona con es_cliente_geper y activo. Los clientes son datos maestros compartidos: NO se filtran
 *   por ide_sucu. Su ubicación es la de la persona (ide_geprov / ide_gecant) y, si no la tiene, la de su dirección
 *   predeterminada (gen_direccion_persona).
 * - Facturado y envíos SÍ son de una empresa: se filtran por el ide_sucu de la CABECERA de la factura (sesión).
 *   Facturado = bases de las facturas en estado normal, sin IVA y sin descontar notas de crédito.
 */
@Injectable()
export class ClientesUbicacionService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    this.core.getVariables(['p_cxc_estado_factura_normal']).then((result) => {
      this.variables = result;
    });
  }

  private meses(dto: GetClientesUbicacionDto): number {
    return MESES_VALIDOS.includes(Number(dto.meses)) ? Number(dto.meses) : 12;
  }

  /**
   * Direcciones de los clientes activos con su GPS validado. estado_geo: SIN (sin coordenadas), INVALIDA (no es un
   * número), OK (dentro del Ecuador), INVERTIDA (latitud y longitud cambiadas de lugar) o FUERA (fuera del país,
   * ej. 0,0).
   */
  private sqlDirecciones(dto: HeaderParamsDto): string {
    const empresa = Number(dto.ideEmpr);
    return `
      SELECT y.*,
             CASE WHEN NULLIF(trim(y.latitud_gedirp), '') IS NULL OR NULLIF(trim(y.longitud_gedirp), '') IS NULL THEN 'SIN'
                  WHEN y.lat IS NULL OR y.lon IS NULL THEN 'INVALIDA'
                  WHEN y.lat BETWEEN ${RANGO_LAT} AND y.lon BETWEEN ${RANGO_LON} THEN 'OK'
                  WHEN y.lon BETWEEN ${RANGO_LAT} AND y.lat BETWEEN ${RANGO_LON} THEN 'INVERTIDA'
                  ELSE 'FUERA' END AS estado_geo
        FROM (
          SELECT dp.ide_gedirp, dp.ide_geper, dp.ide_getidi, dp.nombre_dir_gedirp, dp.direccion_gedirp,
                 dp.ide_geprov, dp.ide_gecant, dp.latitud_gedirp, dp.longitud_gedirp,
                 COALESCE(dp.activo_gedirp, TRUE) AS activo, COALESCE(dp.defecto_gedirp, FALSE) AS defecto,
                 ${numeroGps('dp.latitud_gedirp')} AS lat,
                 ${numeroGps('dp.longitud_gedirp')} AS lon
            FROM gen_direccion_persona dp
            JOIN gen_persona p ON p.ide_geper = dp.ide_geper
             AND p.es_cliente_geper = TRUE AND p.ide_empr = ${empresa} AND COALESCE(p.activo_geper, TRUE)
        ) y`;
  }

  /** Un registro por cliente con su ubicación y lo facturado en el período (facturas y ventas sin IVA). */
  private sqlClientes(dto: GetClientesUbicacionDto & HeaderParamsDto): string {
    const empresa = Number(dto.ideEmpr);
    const sucursal = Number(dto.ideSucu);
    const normal = Number(this.variables.get('p_cxc_estado_factura_normal'));
    const desde = `(CURRENT_DATE - INTERVAL '${this.meses(dto)} months')::date`;

    return `
      SELECT cli.*, COALESCE(v.facturas, 0) AS facturas, COALESCE(v.ventas, 0) AS ventas
        FROM (
          SELECT p.ide_geper, p.uuid::text AS uuid, p.nom_geper, p.identificac_geper, p.direccion_geper,
                 p.telefono_geper, p.movil_geper, p.ide_vgven,
                 COALESCE(p.ide_geprov, d.ide_geprov) AS ide_geprov,
                 COALESCE(p.ide_gecant,
                          CASE WHEN d.ide_geprov IS NOT DISTINCT FROM COALESCE(p.ide_geprov, d.ide_geprov) THEN d.ide_gecant END
                 ) AS ide_gecant,
                 g.lat, g.lon, g.direccion_gps,
                 COALESCE(dc.n_dir, 0)::int AS n_dir,
                 COALESCE(dc.n_problemas, 0)::int AS n_problemas,
                 ${sqlDistanciaKm('g.lat', 'g.lon', 'e.latitud_empr', 'e.longitud_empr')} AS distancia_km
            FROM gen_persona p
            LEFT JOIN LATERAL (
              SELECT dp.ide_geprov, dp.ide_gecant
                FROM gen_direccion_persona dp
               WHERE dp.ide_geper = p.ide_geper AND COALESCE(dp.activo_gedirp, TRUE) AND dp.ide_geprov IS NOT NULL
               ORDER BY dp.defecto_gedirp DESC NULLS LAST, dp.ide_gedirp DESC
               LIMIT 1
            ) d ON TRUE
            -- Coordenadas del cliente: la de su dirección activa con GPS válido (la predeterminada primero).
            LEFT JOIN (
              SELECT DISTINCT ON (x.ide_geper) x.ide_geper, x.lat, x.lon, x.direccion_gedirp AS direccion_gps
                FROM (${this.sqlDirecciones(dto)}) x
               WHERE x.activo AND x.estado_geo = 'OK'
               ORDER BY x.ide_geper, x.defecto DESC, x.ide_gedirp DESC
            ) g ON g.ide_geper = p.ide_geper
            LEFT JOIN (
              SELECT x.ide_geper, COUNT(*) FILTER (WHERE x.activo)::int AS n_dir,
                     COUNT(*) FILTER (WHERE x.activo AND x.estado_geo IN ('INVALIDA', 'FUERA', 'INVERTIDA'))::int AS n_problemas
                FROM (${this.sqlDirecciones(dto)}) x
               GROUP BY x.ide_geper
            ) dc ON dc.ide_geper = p.ide_geper
            LEFT JOIN sis_empresa e ON e.ide_empr = ${empresa}
           WHERE p.es_cliente_geper = TRUE AND p.ide_empr = ${empresa} AND COALESCE(p.activo_geper, TRUE)
        ) cli
        LEFT JOIN (
          SELECT f.ide_geper, COUNT(*)::int AS facturas,
                 COALESCE(SUM(COALESCE(f.base_grabada_cccfa, 0) + COALESCE(f.base_tarifa0_cccfa, 0)
                              + COALESCE(f.base_no_objeto_iva_cccfa, 0)), 0) AS ventas
            FROM cxc_cabece_factura f
           WHERE f.ide_empr = ${empresa} AND f.ide_sucu = ${sucursal} AND f.ide_ccefa = ${normal}
             AND f.fecha_emisi_cccfa >= ${desde}
           GROUP BY f.ide_geper
        ) v ON v.ide_geper = cli.ide_geper`;
  }

  /**
   * Todo el dashboard en una consulta: totales, clientes por provincia (para el mapa) y la mirada de transportes
   * (envíos del período por provincia del cliente, transportista principal y cobertura de tarifas).
   */
  async getDashboardUbicacion(dto: GetClientesUbicacionDto & HeaderParamsDto) {
    const empresa = Number(dto.ideEmpr);
    const sucursal = Number(dto.ideSucu);
    const normal = Number(this.variables.get('p_cxc_estado_factura_normal'));
    const desde = `(CURRENT_DATE - INTERVAL '${this.meses(dto)} months')::date`;
    const agg = (select: string, orden: string) =>
      `(SELECT COALESCE(json_agg(t ORDER BY ${orden}), '[]'::json) FROM (${select}) t)`;

    const r = await this.dataSource.pool.query(
      `WITH c AS (${this.sqlClientes(dto)}),
       env AS (
         SELECT t.ide_cctfa, t.ide_vgtra, t.es_transporte_propio_cctfa AS propio, t.fecha_fin_real_cctfa,
                COALESCE(t.total_flete_real_cctfa, 0) AS flete,
                (t.fecha_fin_real_cctfa - COALESCE(t.fecha_inicio_cctfa, f.fecha_emisi_cccfa)) AS dias,
                c.ide_geprov
           FROM cxc_transporte_factura t
           JOIN cxc_cabece_factura f ON f.ide_cccfa = t.ide_cccfa
           JOIN c ON c.ide_geper = f.ide_geper
          WHERE f.ide_empr = ${empresa} AND f.ide_sucu = ${sucursal} AND f.ide_ccefa = ${normal}
            AND COALESCE(t.fecha_inicio_cctfa, f.fecha_emisi_cccfa) >= ${desde}
       )
       SELECT
         (SELECT row_to_json(k) FROM (
            SELECT COUNT(*)::int AS clientes,
                   COUNT(*) FILTER (WHERE ide_geprov IS NOT NULL)::int AS con_provincia,
                   COUNT(*) FILTER (WHERE ide_gecant IS NOT NULL)::int AS con_canton,
                   COUNT(DISTINCT ide_geprov)::int AS provincias,
                   COUNT(DISTINCT ide_gecant)::int AS cantones,
                   COUNT(*) FILTER (WHERE facturas > 0)::int AS activos,
                   COUNT(*) FILTER (WHERE lat IS NOT NULL)::int AS con_gps,
                   COALESCE(SUM(ventas), 0) AS ventas,
                   COALESCE(SUM(facturas), 0)::int AS facturas
              FROM c) k) AS kpis,
         ${agg(
           `SELECT c.ide_geprov, COALESCE(pr.nombre_geprov, 'Sin provincia') AS provincia, pr.codigo_geprov,
                   COUNT(*)::int AS clientes, COUNT(*) FILTER (WHERE c.facturas > 0)::int AS activos,
                   COALESCE(SUM(c.ventas), 0) AS ventas, COUNT(DISTINCT c.ide_gecant)::int AS cantones
              FROM c LEFT JOIN gen_provincia pr ON pr.ide_geprov = c.ide_geprov
             GROUP BY c.ide_geprov, pr.nombre_geprov, pr.codigo_geprov`,
           't.clientes DESC, t.provincia',
         )} AS por_provincia,
         (SELECT row_to_json(x) FROM (
            SELECT COUNT(*)::int AS envios,
                   COUNT(*) FILTER (WHERE fecha_fin_real_cctfa IS NOT NULL)::int AS entregados,
                   COUNT(*) FILTER (WHERE propio)::int AS propios,
                   COALESCE(SUM(flete), 0) AS flete,
                   ROUND(AVG(dias) FILTER (WHERE dias >= 0), 1) AS dias_promedio,
                   COUNT(DISTINCT ide_geprov)::int AS provincias
              FROM env) x) AS transportes_kpis,
         ${agg(
           `SELECT e.ide_geprov, COALESCE(pr.nombre_geprov, 'Sin provincia') AS provincia, COUNT(*)::int AS envios,
                   COUNT(*) FILTER (WHERE e.fecha_fin_real_cctfa IS NOT NULL)::int AS entregados,
                   COUNT(*) FILTER (WHERE e.propio)::int AS propios,
                   COALESCE(SUM(e.flete), 0) AS flete,
                   ROUND(AVG(e.dias) FILTER (WHERE e.dias >= 0), 1) AS dias_promedio,
                   COUNT(DISTINCT e.ide_vgtra) FILTER (WHERE NOT e.propio)::int AS transportistas,
                   (SELECT tr.nombre_vgtra
                      FROM env e2 JOIN ven_transporte tr ON tr.ide_vgtra = e2.ide_vgtra
                     WHERE e2.ide_geprov IS NOT DISTINCT FROM e.ide_geprov AND NOT e2.propio
                     GROUP BY tr.nombre_vgtra ORDER BY COUNT(*) DESC, tr.nombre_vgtra LIMIT 1) AS transportista_principal,
                   (SELECT COUNT(DISTINCT tt.ide_vgtra)::int
                      FROM ven_tarifa_transporte tt
                     WHERE tt.ide_geprov = e.ide_geprov AND COALESCE(tt.activo_vgttr, TRUE) AND tt.ide_empr = ${empresa}) AS con_tarifa
              FROM env e LEFT JOIN gen_provincia pr ON pr.ide_geprov = e.ide_geprov
             GROUP BY e.ide_geprov, pr.nombre_geprov`,
           't.envios DESC, t.provincia',
         )} AS transportes,
         ${agg(
           `SELECT tr.ide_vgtra, tr.nombre_vgtra AS transportista, COUNT(*)::int AS envios,
                   COUNT(DISTINCT e.ide_geprov)::int AS provincias, COALESCE(SUM(e.flete), 0) AS flete
              FROM env e JOIN ven_transporte tr ON tr.ide_vgtra = e.ide_vgtra
             WHERE NOT e.propio GROUP BY tr.ide_vgtra, tr.nombre_vgtra ORDER BY envios DESC LIMIT 8`,
           't.envios DESC, t.transportista',
         )} AS transportistas_top`,
    );
    const d = r.rows[0];
    return {
      meses: this.meses(dto),
      kpis: d.kpis,
      porProvincia: d.por_provincia,
      transportesKpis: d.transportes_kpis,
      transportes: d.transportes,
      transportistasTop: d.transportistas_top,
    };
  }

  /** Clientes y facturado por cantón (DataTableQuery); opcionalmente de una sola provincia. */
  async getCantonesUbicacion(dto: GetClientesUbicacionDto & HeaderParamsDto) {
    const cond: string[] = [];
    if (dto.sinProvincia === 'true') cond.push('c.ide_geprov IS NULL');
    else if (Number.isInteger(Number(dto.ide_geprov)) && dto.ide_geprov) cond.push(`c.ide_geprov = ${Number(dto.ide_geprov)}`);

    const q = new SelectQuery(
      `SELECT (COALESCE(c.ide_geprov, 0) || '-' || COALESCE(c.ide_gecant, 0)) AS clave,
              c.ide_geprov, COALESCE(pr.nombre_geprov, 'Sin provincia') AS provincia,
              c.ide_gecant, COALESCE(ca.nombre_gecant, 'Sin cantón') AS canton,
              COUNT(*)::int AS clientes,
              COUNT(*) FILTER (WHERE c.facturas > 0)::int AS activos,
              COALESCE(SUM(c.ventas), 0) AS ventas,
              ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY c.ide_geprov), 1) AS pct_provincia
         FROM (${this.sqlClientes(dto)}) c
         LEFT JOIN gen_provincia pr ON pr.ide_geprov = c.ide_geprov
         LEFT JOIN gen_canton ca ON ca.ide_gecant = c.ide_gecant
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        GROUP BY c.ide_geprov, pr.nombre_geprov, c.ide_gecant, ca.nombre_gecant
        ORDER BY clientes DESC, provincia, canton`,
      dto,
    );
    return this.dataSource.createQuery(q);
  }

  /** Listado de clientes con su ubicación y lo facturado en el período (DataTableQuery). */
  async getClientesUbicacion(dto: GetClientesUbicacionDto & HeaderParamsDto) {
    const empresa = Number(dto.ideEmpr);
    const sucursal = Number(dto.ideSucu);
    const normal = Number(this.variables.get('p_cxc_estado_factura_normal'));
    const cond: string[] = [];
    if (dto.sinProvincia === 'true') cond.push('c.ide_geprov IS NULL');
    else if (dto.ide_geprov) cond.push(`c.ide_geprov = ${Number(dto.ide_geprov)}`);
    if (dto.ide_gecant) cond.push(`c.ide_gecant = ${Number(dto.ide_gecant)}`);
    if (dto.compraron === 'true') cond.push('c.facturas > 0');
    if (dto.compraron === 'false') cond.push('c.facturas = 0');
    if (dto.geo === 'con') cond.push('c.lat IS NOT NULL');
    if (dto.geo === 'sin') cond.push('c.lat IS NULL');

    const q = new SelectQuery(
      `SELECT c.ide_geper, c.uuid, c.nom_geper AS cliente, c.identificac_geper AS identificacion,
              pr.nombre_geprov AS provincia, ca.nombre_gecant AS canton, c.direccion_geper AS direccion,
              c.telefono_geper AS telefono, c.movil_geper AS movil, ve.nombre_vgven AS vendedor,
              c.facturas, c.ventas, to_char(u.ultima_compra, 'YYYY-MM-DD') AS ultima_compra,
              c.lat AS latitud, c.lon AS longitud, c.distancia_km, c.n_dir,
              c.ide_geprov, c.ide_gecant
         FROM (${this.sqlClientes(dto)}) c
         LEFT JOIN gen_provincia pr ON pr.ide_geprov = c.ide_geprov
         LEFT JOIN gen_canton ca ON ca.ide_gecant = c.ide_gecant
         LEFT JOIN ven_vendedor ve ON ve.ide_vgven = c.ide_vgven
         LEFT JOIN (
           SELECT f.ide_geper, MAX(f.fecha_emisi_cccfa) AS ultima_compra
             FROM cxc_cabece_factura f
            WHERE f.ide_empr = ${empresa} AND f.ide_sucu = ${sucursal} AND f.ide_ccefa = ${normal}
            GROUP BY f.ide_geper
         ) u ON u.ide_geper = c.ide_geper
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY c.ventas DESC, c.nom_geper`,
      dto,
    );
    return this.dataSource.createQuery(q);
  }

  // ------------------------------------------------------------------ ubicación GPS (latitud / longitud)

  /**
   * Dashboard de coordenadas GPS: cuántos clientes tienen ubicación exacta, calidad de las coordenadas guardadas,
   * cobertura por provincia y distancia de los clientes a la empresa (sis_empresa.latitud_empr / longitud_empr).
   */
  async getDashboardGeo(dto: GetClientesUbicacionDto & HeaderParamsDto) {
    const empresa = Number(dto.ideEmpr);
    const agg = (select: string, orden: string) =>
      `(SELECT COALESCE(json_agg(t ORDER BY ${orden}), '[]'::json) FROM (${select}) t)`;

    const r = await this.dataSource.pool.query(
      `WITH c AS (${this.sqlClientes(dto)}),
       d AS (${this.sqlDirecciones(dto)})
       SELECT
         (SELECT row_to_json(k) FROM (
            SELECT COUNT(*)::int AS clientes,
                   COUNT(*) FILTER (WHERE lat IS NOT NULL)::int AS con_gps,
                   COUNT(*) FILTER (WHERE lat IS NULL)::int AS sin_gps,
                   COUNT(*) FILTER (WHERE lat IS NULL AND n_dir = 0)::int AS sin_direccion,
                   COUNT(*) FILTER (WHERE n_dir > 1)::int AS con_varias_direcciones,
                   COUNT(*) FILTER (WHERE n_problemas > 0)::int AS con_problemas,
                   ROUND(AVG(distancia_km), 1) AS dist_promedio,
                   ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY distancia_km))::numeric, 1) AS dist_mediana,
                   MAX(distancia_km) AS dist_max,
                   COUNT(distancia_km)::int AS con_distancia
              FROM c) k) AS kpis,
         (SELECT row_to_json(x) FROM (
            SELECT COUNT(*) FILTER (WHERE activo)::int AS direcciones,
                   COUNT(*) FILTER (WHERE activo AND estado_geo = 'OK')::int AS ok,
                   COUNT(*) FILTER (WHERE activo AND estado_geo = 'SIN')::int AS sin,
                   COUNT(*) FILTER (WHERE activo AND estado_geo = 'INVALIDA')::int AS invalidas,
                   COUNT(*) FILTER (WHERE activo AND estado_geo = 'FUERA')::int AS fuera,
                   COUNT(*) FILTER (WHERE activo AND estado_geo = 'INVERTIDA')::int AS invertidas
              FROM d) x) AS direcciones,
         (SELECT row_to_json(s) FROM (
            SELECT COUNT(*)::int AS coordenadas, COALESCE(SUM(n), 0)::int AS clientes
              FROM (SELECT COUNT(DISTINCT ide_geper) AS n FROM c WHERE lat IS NOT NULL
                     GROUP BY ROUND(lat, 5), ROUND(lon, 5) HAVING COUNT(DISTINCT ide_geper) > 1) z) s) AS compartidas,
         (SELECT row_to_json(e) FROM (
            SELECT latitud_empr AS lat, longitud_empr AS lon FROM sis_empresa WHERE ide_empr = ${empresa}) e) AS empresa,
         ${agg(
           `SELECT c.ide_geprov, COALESCE(pr.nombre_geprov, 'Sin provincia') AS provincia,
                   COUNT(*)::int AS clientes, COUNT(*) FILTER (WHERE c.lat IS NOT NULL)::int AS con_gps
              FROM c LEFT JOIN gen_provincia pr ON pr.ide_geprov = c.ide_geprov
             GROUP BY c.ide_geprov, pr.nombre_geprov`,
           't.clientes DESC, t.provincia',
         )} AS por_provincia,
         ${agg(
           `SELECT orden, CASE orden WHEN 1 THEN 'Menos de 10 km' WHEN 2 THEN '10 a 50 km' WHEN 3 THEN '50 a 100 km'
                                     WHEN 4 THEN '100 a 250 km' WHEN 5 THEN '250 a 500 km' ELSE 'Más de 500 km' END AS rango,
                   COUNT(*)::int AS clientes, COALESCE(SUM(ventas), 0) AS ventas
              FROM (SELECT ventas,
                           CASE WHEN distancia_km < 10 THEN 1 WHEN distancia_km < 50 THEN 2 WHEN distancia_km < 100 THEN 3
                                WHEN distancia_km < 250 THEN 4 WHEN distancia_km < 500 THEN 5 ELSE 6 END AS orden
                      FROM c WHERE distancia_km IS NOT NULL) q
             GROUP BY orden`,
           't.orden',
         )} AS rangos,
         ${agg(
           `SELECT c.ide_geper, c.uuid, c.nom_geper AS cliente, pr.nombre_geprov AS provincia, ca.nombre_gecant AS canton,
                   c.distancia_km, c.ventas, c.facturas
              FROM c LEFT JOIN gen_provincia pr ON pr.ide_geprov = c.ide_geprov
                     LEFT JOIN gen_canton ca ON ca.ide_gecant = c.ide_gecant
             WHERE c.distancia_km IS NOT NULL ORDER BY c.distancia_km DESC LIMIT 10`,
           't.distancia_km DESC',
         )} AS mas_lejanos`,
    );
    const d = r.rows[0];
    return {
      meses: this.meses(dto),
      kpis: d.kpis,
      direcciones: d.direcciones,
      compartidas: d.compartidas,
      empresa: d.empresa,
      porProvincia: d.por_provincia,
      rangos: d.rangos,
      masLejanos: d.mas_lejanos,
    };
  }

  /** Un punto por cliente con coordenadas válidas, para dibujarlos en el mapa (máximo 8000, los de más facturado primero). */
  async getPuntosClientes(dto: GetClientesUbicacionDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT c.ide_geper, c.uuid, c.nom_geper AS cliente, c.lat, c.lon, c.ide_geprov,
              pr.nombre_geprov AS provincia, ca.nombre_gecant AS canton, c.direccion_gps AS direccion,
              c.facturas, c.ventas, c.distancia_km, (COUNT(*) OVER ())::int AS total
         FROM (${this.sqlClientes(dto)}) c
         LEFT JOIN gen_provincia pr ON pr.ide_geprov = c.ide_geprov
         LEFT JOIN gen_canton ca ON ca.ide_gecant = c.ide_gecant
        WHERE c.lat IS NOT NULL
        ORDER BY c.ventas DESC, c.nom_geper
        LIMIT ${MAX_PUNTOS}`,
    );
    const total = r.rows[0]?.total ?? 0;
    return {
      total,
      truncado: total > MAX_PUNTOS,
      rows: r.rows.map(({ total: _t, ...fila }) => ({ ...fila, lat: Number(fila.lat), lon: Number(fila.lon) })),
    };
  }

  /** Direcciones de clientes con su GPS y el resultado de la validación (DataTableQuery), para revisar y corregir. */
  async getDireccionesGeo(dto: GetClientesUbicacionDto & HeaderParamsDto) {
    const empresa = Number(dto.ideEmpr);
    const cond: string[] = ['d.activo'];
    if (dto.estadoGeo) cond.push(`d.estado_geo = '${dto.estadoGeo}'`);
    if (dto.sinProvincia === 'true') cond.push('d.ide_geprov IS NULL');
    else if (dto.ide_geprov) cond.push(`d.ide_geprov = ${Number(dto.ide_geprov)}`);

    const q = new SelectQuery(
      `SELECT d.ide_gedirp, p.uuid::text AS uuid, p.ide_geper, upper(p.nom_geper) AS cliente,
              p.identificac_geper AS identificacion, ti.nombre_getidi AS tipo, d.direccion_gedirp AS direccion,
              pr.nombre_geprov AS provincia, ca.nombre_gecant AS canton,
              d.latitud_gedirp AS latitud, d.longitud_gedirp AS longitud, d.estado_geo,
              CASE WHEN d.estado_geo = 'OK'
                   THEN ${sqlDistanciaKm('d.lat', 'd.lon', 'e.latitud_empr', 'e.longitud_empr')} END AS distancia_km,
              d.defecto
         FROM (${this.sqlDirecciones(dto)}) d
         JOIN gen_persona p ON p.ide_geper = d.ide_geper
         LEFT JOIN gen_tipo_direccion ti ON ti.ide_getidi = d.ide_getidi
         LEFT JOIN gen_provincia pr ON pr.ide_geprov = d.ide_geprov
         LEFT JOIN gen_canton ca ON ca.ide_gecant = d.ide_gecant
         LEFT JOIN sis_empresa e ON e.ide_empr = ${empresa}
        WHERE ${cond.join(' AND ')}
        ORDER BY CASE d.estado_geo WHEN 'INVALIDA' THEN 1 WHEN 'FUERA' THEN 2 WHEN 'INVERTIDA' THEN 3 WHEN 'SIN' THEN 4 ELSE 5 END,
                 p.nom_geper`,
      dto,
    );
    return this.dataSource.createQuery(q);
  }
}
