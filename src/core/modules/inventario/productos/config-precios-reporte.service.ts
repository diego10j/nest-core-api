import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DocumentosCxPService } from 'src/core/modules/cuentas-por-pagar/documentos-cxp.service';
import { UpdateQuery } from 'src/core/connection/helpers';

import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { CambiarEstadoConfigPreciosDto } from './dto/cambiar-estado-config-precios.dto';
import { HistorialConfigPreciosDto, ResumenHistorialConfigPreciosDto } from './dto/historial-config-precios.dto';

const MENSAJE_SIN_HISTORIAL =
  'Falta crear el historial: ejecuta el script scripts/core/modules/inventario/inv_conf_precios_hist.sql';

/** Reporte / dashboard de monitoreo de las configuraciones de precios de venta y su historial de cambios. */
@Injectable()
export class ConfigPreciosReporteService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly cxp: DocumentosCxPService,
  ) {}

  /**
   * Todas las configuraciones de la empresa con su producto, forma de pago y —con el costo promedio (PPM) de hoy—
   * la utilidad y el precio sin IVA equivalentes (sea cual sea el tipo de configuración). Incluye además los productos
   * con kardex que no tienen ninguna configuración vigente.
   */
  async getReporteConfigPrecios(dtoIn: HeaderParamsDto) {
    const ideEmpr = Number(dtoIn.ideEmpr);
    const ideSucu = Number(dtoIn.ideSucu) || 0;
    // Tarifa de IVA vigente hoy (con_porcen_impues), la misma que usa el resto del ERP.
    const tarifaIva = Number(await this.cxp.getPorcentajeIva(new Date().toLocaleDateString('en-CA')));

    const qRows = new SelectQuery(`
      WITH costos AS (
          SELECT p.ide_inarti,
                 (SELECT k.costo_unitario::float8
                    FROM f_costo_unitario_ppmp(${ideEmpr}, ${ideSucu}, p.ide_inarti, CURRENT_DATE) k
                   LIMIT 1) AS costo
          FROM (SELECT DISTINCT c.ide_inarti
                  FROM inv_conf_precios_articulo c
                  JOIN inv_articulo a ON a.ide_inarti = c.ide_inarti
                 WHERE a.ide_empr = ${ideEmpr}) p
      )
      SELECT
          c.ide_incpa,
          c.ide_inarti,
          a.uuid,
          a.nombre_inarti,
          a.codigo_inarti,
          cat.nombre_incate,
          u.siglas_inuni,
          COALESCE(a.decim_stock_inarti, 2) AS decim_stock_inarti,
          c.rangos_incpa,
          c.rango1_cant_incpa::float8 AS rango1_cant_incpa,
          c.rango2_cant_incpa::float8 AS rango2_cant_incpa,
          c.rango_infinito_incpa,
          c.precio_fijo_incpa::float8 AS precio_fijo_incpa,
          c.porcentaje_util_incpa::float8 AS porcentaje_util_incpa,
          c.incluye_iva_incpa,
          c.observacion_incpa,
          c.activo_incpa,
          c.autorizado_incpa,
          c.ide_cncfp,
          cp.nombre_cncfp,
          c.ide_cndfp,
          fp.nombre_cndfp,
          c.usuario_ingre,
          c.hora_ingre,
          c.usuario_actua,
          c.hora_actua,
          k.costo AS costo_actual,
          CASE
              WHEN c.precio_fijo_incpa IS NOT NULL AND k.costo > 0
                  THEN round((((c.precio_fijo_incpa / CASE WHEN c.incluye_iva_incpa THEN ${1 + tarifaIva} ELSE 1 END) - k.costo)
                              / k.costo * 100)::numeric, 2)::float8
              ELSE c.porcentaje_util_incpa::float8
          END AS utilidad_pct,
          CASE
              WHEN c.precio_fijo_incpa IS NOT NULL
                  THEN round((c.precio_fijo_incpa / CASE WHEN c.incluye_iva_incpa THEN ${1 + tarifaIva} ELSE 1 END)::numeric, 4)::float8
              WHEN k.costo > 0 AND c.porcentaje_util_incpa IS NOT NULL
                  THEN round((k.costo * (1 + c.porcentaje_util_incpa / 100))::numeric, 4)::float8
          END AS precio_sin_iva
      FROM inv_conf_precios_articulo c
      JOIN inv_articulo a ON a.ide_inarti = c.ide_inarti
      LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni
      LEFT JOIN inv_categoria cat ON cat.ide_incate = a.ide_incate
      LEFT JOIN con_cabece_forma_pago cp ON cp.ide_cncfp = c.ide_cncfp
      LEFT JOIN con_deta_forma_pago fp ON fp.ide_cndfp = c.ide_cndfp
      LEFT JOIN costos k ON k.ide_inarti = c.ide_inarti
      WHERE a.ide_empr = ${ideEmpr}
      ORDER BY unaccent(a.nombre_inarti), cp.nombre_cncfp NULLS LAST, c.rangos_incpa, c.rango1_cant_incpa
    `);
    qRows.setLazy(false);

    const qSin = new SelectQuery(`
      SELECT a.ide_inarti, a.uuid, a.nombre_inarti, a.codigo_inarti, cat.nombre_incate,
             COUNT(*) OVER () AS total
      FROM inv_articulo a
      LEFT JOIN inv_categoria cat ON cat.ide_incate = a.ide_incate
      WHERE a.ide_intpr = 1
        AND a.nivel_inarti = 'HIJO'
        AND a.activo_inarti = true
        AND a.hace_kardex_inarti IS TRUE
        AND a.ide_empr = ${ideEmpr}
        AND NOT EXISTS (
            SELECT 1 FROM inv_conf_precios_articulo c
             WHERE c.ide_inarti = a.ide_inarti AND c.activo_incpa = true AND c.autorizado_incpa = true)
      ORDER BY unaccent(a.nombre_inarti)
      LIMIT 300
    `);
    qSin.setLazy(false);

    const [rows, sinConfig] = await Promise.all([
      this.dataSource.createSelectQuery(qRows) as Promise<any[]>,
      this.dataSource.createSelectQuery(qSin) as Promise<any[]>,
    ]);

    return {
      rows,
      sinConfig: { total: Number(sinConfig[0]?.total ?? 0), items: sinConfig },
    };
  }

  /** Activa/desactiva y/o autoriza/desautoriza varias configuraciones a la vez. */
  async cambiarEstado(dtoIn: CambiarEstadoConfigPreciosDto & HeaderParamsDto) {
    if (dtoIn.activo === undefined && dtoIn.autorizado === undefined) {
      throw new BadRequestException('Indica qué estado cambiar (activo o autorizado)');
    }
    const update = new UpdateQuery('inv_conf_precios_articulo', 'ide_incpa', dtoIn);
    if (dtoIn.activo !== undefined) update.values.set('activo_incpa', dtoIn.activo);
    if (dtoIn.autorizado !== undefined) update.values.set('autorizado_incpa', dtoIn.autorizado);
    update.where = 'ide_incpa = ANY ($1)';
    update.addParam(1, dtoIn.ide);
    await this.dataSource.createQuery(update);
    return { message: 'ok', total: dtoIn.ide.length };
  }

  /** Cambios registrados (altas, ediciones, bajas y fotos diarias) con el costo vigente en cada momento. */
  async getHistorial(dtoIn: HistorialConfigPreciosDto & HeaderParamsDto) {
    const filtroProducto = dtoIn.ide_inarti ? 'AND h.ide_inarti = $3' : '';
    const q = new SelectQuery(`
      SELECT h.ide_inchp, h.ide_incpa, h.ide_inarti, a.uuid, a.nombre_inarti, h.accion, h.fecha_inchp, h.usuario_inchp,
             h.ide_cncfp, cp.nombre_cncfp, h.rangos_incpa,
             h.rango1_cant_incpa::float8 AS rango1_cant_incpa, h.rango2_cant_incpa::float8 AS rango2_cant_incpa,
             h.rango_infinito_incpa,
             h.precio_fijo_incpa::float8 AS precio_fijo_incpa, h.porcentaje_util_incpa::float8 AS porcentaje_util_incpa,
             h.incluye_iva_incpa, h.activo_incpa, h.autorizado_incpa,
             h.precio_fijo_prev::float8 AS precio_fijo_prev, h.porcentaje_util_prev::float8 AS porcentaje_util_prev,
             h.activo_prev, h.autorizado_prev,
             h.costo_ppm::float8 AS costo_ppm, h.utilidad_pct::float8 AS utilidad_pct,
             h.precio_sin_iva::float8 AS precio_sin_iva
      FROM inv_conf_precios_hist h
      JOIN inv_articulo a ON a.ide_inarti = h.ide_inarti
      LEFT JOIN con_cabece_forma_pago cp ON cp.ide_cncfp = h.ide_cncfp
      WHERE h.ide_empr = ${Number(dtoIn.ideEmpr)}
        AND h.fecha_inchp::date BETWEEN $1::date AND $2::date
        ${filtroProducto}
      ORDER BY h.fecha_inchp DESC, h.ide_inchp DESC
      LIMIT 5000
    `);
    q.addParam(1, dtoIn.fechaInicio);
    q.addParam(2, dtoIn.fechaFin);
    if (dtoIn.ide_inarti) q.addParam(3, dtoIn.ide_inarti);
    q.setLazy(false);
    return this.ejecutarHistorial(q);
  }

  /**
   * Tendencia del período: utilidad promedio y número de cambios por mes, y los productos cuyo costo más subió/bajó
   * entre su primer y su último registro (con la utilidad de sus configuraciones en esos dos momentos).
   */
  async getResumenHistorial(dtoIn: ResumenHistorialConfigPreciosDto & HeaderParamsDto) {
    const ideEmpr = Number(dtoIn.ideEmpr);

    const qMes = new SelectQuery(`
      SELECT to_char(date_trunc('month', h.fecha_inchp), 'YYYY-MM') AS mes,
             round(avg(h.utilidad_pct)::numeric, 2)::float8 AS utilidad_promedio,
             COUNT(*) FILTER (WHERE h.accion <> 'SNAPSHOT') AS cambios,
             COUNT(*) FILTER (WHERE h.accion = 'UPDATE'
                  AND COALESCE(h.porcentaje_util_incpa, 0) > COALESCE(h.porcentaje_util_prev, 0)
                  AND h.porcentaje_util_prev IS NOT NULL) AS subas,
             COUNT(*) FILTER (WHERE h.accion = 'UPDATE'
                  AND COALESCE(h.porcentaje_util_incpa, 0) < COALESCE(h.porcentaje_util_prev, 0)
                  AND h.porcentaje_util_prev IS NOT NULL) AS bajas
      FROM inv_conf_precios_hist h
      WHERE h.ide_empr = ${ideEmpr}
        AND h.fecha_inchp::date BETWEEN $1::date AND $2::date
        AND h.utilidad_pct IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);
    qMes.addParam(1, dtoIn.fechaInicio);
    qMes.addParam(2, dtoIn.fechaFin);
    qMes.setLazy(false);

    const qCostos = new SelectQuery(`
      WITH h AS (
          SELECT ide_inarti, fecha_inchp::date AS dia, costo_ppm, utilidad_pct
          FROM inv_conf_precios_hist
          WHERE ide_empr = ${ideEmpr}
            AND fecha_inchp::date BETWEEN $1::date AND $2::date
            AND costo_ppm > 0
      ),
      rango AS (
          SELECT ide_inarti, min(dia) AS d1, max(dia) AS d2
          FROM h GROUP BY ide_inarti HAVING min(dia) <> max(dia)
      ),
      ini AS (
          SELECT h.ide_inarti, avg(h.costo_ppm) AS costo, avg(h.utilidad_pct) AS util
          FROM h JOIN rango r ON r.ide_inarti = h.ide_inarti AND h.dia = r.d1 GROUP BY h.ide_inarti
      ),
      fin AS (
          SELECT h.ide_inarti, avg(h.costo_ppm) AS costo, avg(h.utilidad_pct) AS util
          FROM h JOIN rango r ON r.ide_inarti = h.ide_inarti AND h.dia = r.d2 GROUP BY h.ide_inarti
      )
      SELECT a.ide_inarti, a.uuid, a.nombre_inarti, r.d1, r.d2,
             round(i.costo::numeric, 4)::float8 AS costo_ini, round(f.costo::numeric, 4)::float8 AS costo_fin,
             round(((f.costo - i.costo) / i.costo * 100)::numeric, 2)::float8 AS var_costo_pct,
             round(i.util::numeric, 2)::float8 AS util_ini, round(f.util::numeric, 2)::float8 AS util_fin
      FROM rango r
      JOIN ini i ON i.ide_inarti = r.ide_inarti
      JOIN fin f ON f.ide_inarti = r.ide_inarti
      JOIN inv_articulo a ON a.ide_inarti = r.ide_inarti
      WHERE abs(f.costo - i.costo) / i.costo > 0.001
      ORDER BY abs(f.costo - i.costo) / i.costo DESC
      LIMIT 100
    `);
    qCostos.addParam(1, dtoIn.fechaInicio);
    qCostos.addParam(2, dtoIn.fechaFin);
    qCostos.setLazy(false);

    const [porMes, costos] = await Promise.all([this.ejecutarHistorial(qMes), this.ejecutarHistorial(qCostos)]);
    return { porMes, costos };
  }

  /** Foto de hoy de todas las configuraciones vigentes (con el costo de hoy), para seguir la tendencia. */
  async tomarSnapshot(dtoIn: HeaderParamsDto) {
    const q = new SelectQuery(`SELECT f_inv_conf_precios_snapshot($1, $2) AS total`);
    q.addParam(1, Number(dtoIn.ideEmpr));
    q.addParam(2, dtoIn.login ?? 'snapshot');
    q.setLazy(false);
    const fila = ((await this.ejecutarHistorial(q)) as any[])[0];
    return { message: 'ok', total: Number(fila?.total ?? 0) };
  }

  private async ejecutarHistorial(query: SelectQuery) {
    try {
      return (await this.dataSource.createSelectQuery(query)) as any[];
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (/inv_conf_precios_hist|f_inv_conf_precios_snapshot|does not exist|no existe/i.test(mensaje)) {
        throw new BadRequestException(MENSAJE_SIN_HISTORIAL);
      }
      throw error;
    }
  }
}
