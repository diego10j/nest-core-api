import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';

/** Costo estimado de consultas anteriores al registro de costo (gpt-4o-mini por tokens). */
const COSTO_ESTIMADO = `COALESCE(c.costo_usd_bdcon,
  (COALESCE(c.tokens_entrada_bdcon, 0) * 0.15 + COALESCE(c.tokens_salida_bdcon, 0) * 0.6) / 1000000.0)`;

/**
 * Panel de uso de QuimIA (Administración → Telegram → Uso y KPIs): consultas del chat del ERP y de
 * Telegram, comandos, costo de IA, preguntas sin respuesta y calificaciones. Datos de bdt_consulta,
 * bdt_documento (extracciones) y qmi_transcripcion (audios).
 */
@Injectable()
export class QuimiaUsoService {
  constructor(private readonly dataSource: DataSourceService) {}

  async getUso(dto: { fechaDesde: string; fechaHasta: string; canal?: string | null }, ideEmpr: number) {
    const params = [ideEmpr, dto.fechaDesde, dto.fechaHasta, dto.canal || null];
    const filtro = `c.ide_empr = $1 AND c.fecha_ingre >= $2::date AND c.fecha_ingre < $3::date + 1
                    AND ($4::text IS NULL OR c.canal_bdcon = $4)`;
    const q = (sql: string, p: unknown[] = params) => this.dataSource.pool.query(sql, p).then((r) => r.rows);
    const opcional = (sql: string, p: unknown[]) => this.dataSource.pool.query(sql, p).then((r) => r.rows).catch(() => []);

    const [kpis, serie, herramientas, productos, sinRespuesta, negativas, usuarios, extraccion, audios] = await Promise.all([
      q(`SELECT COUNT(*)::int AS consultas,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'ASESOR')::int AS erp,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'TELEGRAM')::int AS telegram,
                COUNT(*) FILTER (WHERE c.modo_bdcon = 'COMANDO')::int AS comandos,
                COUNT(*) FILTER (WHERE c.modo_bdcon = 'IA_GENERAL')::int AS ia_general,
                COUNT(*) FILTER (WHERE c.entrada_bdcon = 'AUDIO')::int AS por_voz,
                COUNT(*) FILTER (WHERE c.sin_dato_bdcon)::int AS sin_respuesta,
                COUNT(*) FILTER (WHERE c.util_bdcon)::int AS positivas,
                COUNT(*) FILTER (WHERE c.util_bdcon = FALSE)::int AS negativas,
                COUNT(DISTINCT COALESCE(c.telefono_bdcon, c.usuario_ingre))::int AS usuarios,
                ROUND(AVG(c.ms_respuesta_bdcon) FILTER (WHERE c.modo_bdcon <> 'COMANDO'))::int AS ms_promedio,
                ROUND(SUM(${COSTO_ESTIMADO})::numeric, 4) AS costo_consultas
           FROM bdt_consulta c WHERE ${filtro}`),
      q(`SELECT TO_CHAR(c.fecha_ingre::date, 'YYYY-MM-DD') AS fecha,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'ASESOR')::int AS erp,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'TELEGRAM')::int AS telegram
           FROM bdt_consulta c WHERE ${filtro}
          GROUP BY c.fecha_ingre::date ORDER BY c.fecha_ingre::date`),
      q(`SELECT h AS herramienta, COUNT(*)::int AS usos
           FROM bdt_consulta c, UNNEST(c.herramientas_bdcon) AS h
          WHERE ${filtro} GROUP BY h ORDER BY usos DESC LIMIT 12`),
      q(`SELECT a.nombre_inarti AS producto, COUNT(*)::int AS consultas,
                COUNT(*) FILTER (WHERE c.sin_dato_bdcon)::int AS sin_respuesta
           FROM bdt_consulta c JOIN inv_articulo a ON a.ide_inarti = c.ide_inarti
          WHERE ${filtro} GROUP BY a.nombre_inarti ORDER BY consultas DESC LIMIT 10`),
      q(`SELECT c.ide_bdcon, TO_CHAR(c.fecha_ingre, 'YYYY-MM-DD HH24:MI') AS fecha, c.pregunta_bdcon AS pregunta,
                c.canal_bdcon AS canal, COALESCE(u.alias_tlusu, c.usuario_ingre) AS usuario, a.nombre_inarti AS producto
           FROM bdt_consulta c
           LEFT JOIN tlg_usuario u ON u.ide_tlusu = c.ide_tlusu
           LEFT JOIN inv_articulo a ON a.ide_inarti = c.ide_inarti
          WHERE ${filtro} AND c.sin_dato_bdcon AND c.modo_bdcon <> 'COMANDO'
          ORDER BY c.fecha_ingre DESC LIMIT 40`),
      q(`SELECT c.ide_bdcon, TO_CHAR(c.fecha_ingre, 'YYYY-MM-DD HH24:MI') AS fecha, c.pregunta_bdcon AS pregunta,
                LEFT(c.respuesta_bdcon, 600) AS respuesta, c.canal_bdcon AS canal,
                COALESCE(u.alias_tlusu, c.usuario_ingre) AS usuario
           FROM bdt_consulta c LEFT JOIN tlg_usuario u ON u.ide_tlusu = c.ide_tlusu
          WHERE ${filtro} AND c.util_bdcon = FALSE
          ORDER BY c.fecha_ingre DESC LIMIT 40`),
      q(`SELECT COALESCE(u.alias_tlusu, c.usuario_ingre, '—') AS usuario, c.canal_bdcon AS canal,
                COUNT(*)::int AS consultas,
                COUNT(*) FILTER (WHERE c.modo_bdcon = 'COMANDO')::int AS comandos,
                COUNT(*) FILTER (WHERE c.sin_dato_bdcon)::int AS sin_respuesta,
                COUNT(*) FILTER (WHERE c.util_bdcon = FALSE)::int AS negativas,
                ROUND(SUM(${COSTO_ESTIMADO})::numeric, 4) AS costo,
                TO_CHAR(MAX(c.fecha_ingre), 'YYYY-MM-DD HH24:MI') AS ultima
           FROM bdt_consulta c LEFT JOIN tlg_usuario u ON u.ide_tlusu = c.ide_tlusu
          WHERE ${filtro}
          GROUP BY COALESCE(u.alias_tlusu, c.usuario_ingre, '—'), c.canal_bdcon
          ORDER BY consultas DESC LIMIT 50`),
      opcional(
        `SELECT COUNT(*)::int AS documentos, ROUND(COALESCE(SUM(costo_usd_bddoc), 0)::numeric, 4) AS costo,
                COUNT(*) FILTER (WHERE ide_bddoc_origen IS NOT NULL)::int AS reutilizados
           FROM bdt_documento WHERE ide_empr = $1 AND fecha_proceso_bddoc >= $2::date AND fecha_proceso_bddoc < $3::date + 1`,
        params.slice(0, 3),
      ),
      opcional(
        `SELECT COUNT(*)::int AS audios, ROUND(COALESCE(SUM(duracion_seg_qmtra), 0) / 60.0, 1) AS minutos,
                ROUND(COALESCE(SUM(costo_usd_qmtra), 0)::numeric, 4) AS costo
           FROM qmi_transcripcion WHERE ide_empr = $1 AND fecha_ingre >= $2::date AND fecha_ingre < $3::date + 1`,
        params.slice(0, 3),
      ),
    ]);

    const k = kpis[0] ?? {};
    const costoConsultas = Number(k.costo_consultas ?? 0);
    const costoExtraccion = Number(extraccion[0]?.costo ?? 0);
    const costoAudios = Number(audios[0]?.costo ?? 0);
    return {
      kpis: {
        ...k,
        costo_consultas: costoConsultas,
        costo_extraccion: costoExtraccion,
        costo_audios: costoAudios,
        costo_total: Math.round((costoConsultas + costoExtraccion + costoAudios) * 10000) / 10000,
        documentos_extraidos: extraccion[0]?.documentos ?? 0,
        documentos_reutilizados: extraccion[0]?.reutilizados ?? 0,
        audios: audios[0]?.audios ?? 0,
        minutos_audio: Number(audios[0]?.minutos ?? 0),
        porcentaje_sin_respuesta: k.consultas ? Math.round((k.sin_respuesta / k.consultas) * 1000) / 10 : 0,
        satisfaccion: k.positivas + k.negativas ? Math.round((k.positivas / (k.positivas + k.negativas)) * 1000) / 10 : null,
      },
      serie,
      herramientas,
      productos,
      sinRespuesta,
      negativas,
      usuarios: usuarios.map((u) => ({ ...u, costo: Number(u.costo) })),
    };
  }

  /**
   * Monitor de conversaciones (Administración → Telegram → Conversaciones): preguntas y respuestas de
   * QuimIA con KPIs por canal y por persona. La persona es el usuario del ERP (canal ASESOR) o el teléfono
   * (canal TELEGRAM). Las opciones de los filtros se calculan sin el filtro de persona para no vaciar el combo.
   */
  async getConversaciones(
    dto: { fechaDesde: string; fechaHasta: string; canal?: string | null; usuario?: string | null; telefono?: string | null },
    ideEmpr: number,
  ) {
    const base = [ideEmpr, dto.fechaDesde, dto.fechaHasta, dto.canal || null];
    const filtroBase = `c.ide_empr = $1 AND c.fecha_ingre >= $2::date AND c.fecha_ingre < $3::date + 1
                        AND c.canal_bdcon IN ('ASESOR', 'TELEGRAM') AND ($4::text IS NULL OR c.canal_bdcon = $4)`;
    const params = [...base, dto.usuario || null, dto.telefono || null];
    const filtro = `${filtroBase}
                    AND ($5::text IS NULL OR (c.canal_bdcon = 'ASESOR' AND c.usuario_ingre = $5))
                    AND ($6::text IS NULL OR (c.canal_bdcon = 'TELEGRAM' AND c.telefono_bdcon = $6))`;
    // Persona legible: alias de Telegram (con su número) o usuario del ERP.
    const persona = `CASE WHEN c.canal_bdcon = 'TELEGRAM'
                          THEN COALESCE(u.alias_tlusu || ' (' || c.telefono_bdcon || ')', u.alias_tlusu, c.telefono_bdcon, '—')
                          ELSE COALESCE(c.usuario_ingre, '—') END`;
    const q = (sql: string, p: unknown[] = params) => this.dataSource.pool.query(sql, p).then((r) => r.rows);

    const [kpis, serie, personas, filas, usuarios, telefonos] = await Promise.all([
      q(`SELECT COUNT(*)::int AS consultas,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'ASESOR')::int AS erp,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'TELEGRAM')::int AS telegram,
                COUNT(*) FILTER (WHERE c.fecha_ingre >= CURRENT_DATE)::int AS hoy,
                COUNT(DISTINCT CASE WHEN c.canal_bdcon = 'TELEGRAM' THEN 'T' || COALESCE(c.telefono_bdcon, '')
                                    ELSE 'E' || COALESCE(c.usuario_ingre, '') END)::int AS personas,
                COUNT(*) FILTER (WHERE c.entrada_bdcon = 'AUDIO')::int AS por_voz,
                COUNT(*) FILTER (WHERE c.sin_dato_bdcon)::int AS sin_respuesta,
                COUNT(*) FILTER (WHERE c.util_bdcon)::int AS positivas,
                COUNT(*) FILTER (WHERE c.util_bdcon = FALSE)::int AS negativas,
                ROUND(AVG(c.ms_respuesta_bdcon) FILTER (WHERE c.modo_bdcon <> 'COMANDO'))::int AS ms_promedio,
                TO_CHAR(MAX(c.fecha_ingre), 'YYYY-MM-DD HH24:MI') AS ultima
           FROM bdt_consulta c WHERE ${filtro}`),
      q(`SELECT TO_CHAR(c.fecha_ingre::date, 'YYYY-MM-DD') AS fecha,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'ASESOR')::int AS erp,
                COUNT(*) FILTER (WHERE c.canal_bdcon = 'TELEGRAM')::int AS telegram
           FROM bdt_consulta c WHERE ${filtro}
          GROUP BY c.fecha_ingre::date ORDER BY c.fecha_ingre::date`),
      q(`SELECT ${persona} AS persona, c.canal_bdcon AS canal,
                MAX(c.usuario_ingre) FILTER (WHERE c.canal_bdcon = 'ASESOR') AS usuario,
                MAX(c.telefono_bdcon) AS telefono, COUNT(*)::int AS consultas,
                COUNT(*) FILTER (WHERE c.sin_dato_bdcon)::int AS sin_respuesta,
                COUNT(*) FILTER (WHERE c.util_bdcon = FALSE)::int AS negativas,
                TO_CHAR(MAX(c.fecha_ingre), 'YYYY-MM-DD HH24:MI') AS ultima
           FROM bdt_consulta c LEFT JOIN tlg_usuario u ON u.ide_tlusu = c.ide_tlusu
          WHERE ${filtro}
          GROUP BY 1, 2 ORDER BY consultas DESC LIMIT 15`),
      q(`SELECT c.ide_bdcon, TO_CHAR(c.fecha_ingre, 'YYYY-MM-DD HH24:MI:SS') AS fecha, c.canal_bdcon AS canal,
                ${persona} AS persona, c.usuario_ingre AS usuario, c.telefono_bdcon AS telefono,
                c.pregunta_bdcon AS pregunta, LEFT(c.respuesta_bdcon, 4000) AS respuesta,
                c.modo_bdcon AS modo, c.entrada_bdcon AS entrada, c.herramientas_bdcon AS herramientas,
                c.sin_dato_bdcon AS sin_respuesta, c.util_bdcon AS util, c.ms_respuesta_bdcon AS ms,
                a.nombre_inarti AS producto
           FROM bdt_consulta c
           LEFT JOIN tlg_usuario u ON u.ide_tlusu = c.ide_tlusu
           LEFT JOIN inv_articulo a ON a.ide_inarti = c.ide_inarti
          WHERE ${filtro}
          ORDER BY c.fecha_ingre DESC, c.ide_bdcon DESC LIMIT 300`),
      q(
        `SELECT c.usuario_ingre AS valor, COUNT(*)::int AS consultas
           FROM bdt_consulta c WHERE ${filtroBase} AND c.canal_bdcon = 'ASESOR' AND c.usuario_ingre IS NOT NULL
          GROUP BY 1 ORDER BY consultas DESC`,
        base,
      ),
      q(
        `SELECT c.telefono_bdcon AS valor, MAX(u.alias_tlusu) AS alias, COUNT(*)::int AS consultas
           FROM bdt_consulta c LEFT JOIN tlg_usuario u ON u.ide_tlusu = c.ide_tlusu
          WHERE ${filtroBase} AND c.canal_bdcon = 'TELEGRAM' AND c.telefono_bdcon IS NOT NULL
          GROUP BY 1 ORDER BY consultas DESC`,
        base,
      ),
    ]);

    const k = kpis[0] ?? {};
    return {
      kpis: {
        ...k,
        porcentaje_sin_respuesta: k.consultas ? Math.round((k.sin_respuesta / k.consultas) * 1000) / 10 : 0,
        satisfaccion: k.positivas + k.negativas ? Math.round((k.positivas / (k.positivas + k.negativas)) * 1000) / 10 : null,
      },
      serie,
      personas,
      conversaciones: filas,
      /** Se devolvieron solo las 300 más recientes. */
      recortado: filas.length === 300 && k.consultas > 300,
      opciones: { usuarios, telefonos },
    };
  }
}
