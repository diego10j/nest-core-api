import { Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { SyncLogQueryDto } from './dto/sync-log-query.dto';
import { AgentMetrics, DailyMetrics, SyncLogEntry } from './interfaces/ycloud-metrics.interface';

@Injectable()
export class YcloudMetricsService {
  private readonly logger = new Logger(YcloudMetricsService.name);

  constructor(public readonly dataSource: DataSourceService) {}

  async getDailyMetrics(ideEmpr: number, fechaDesde: string, fechaHasta: string): Promise<DailyMetrics[]> {
    const query = new SelectQuery(`
      SELECT
        fecha_whmed,
        mensajes_enviados,
        mensajes_recibidos,
        respuestas_dentro_24h,
        respuestas_fuera_24h,
        tiempo_respuesta_promedio_seg,
        chats_nuevos,
        chats_atendidos,
        templates_enviados,
        mensajes_fallidos
      FROM wha_metrics_diaria
      WHERE ide_empr = $1
        AND fecha_whmed >= $2::date
        AND fecha_whmed <= $3::date
      ORDER BY fecha_whmed DESC
    `);
    query.addIntParam(1, ideEmpr);
    query.addStringParam(2, fechaDesde);
    query.addStringParam(3, fechaHasta);
    return this.dataSource.createSelectQuery(query);
  }

  async getAgentMetrics(ideEmpr: number, fechaDesde: string, fechaHasta: string): Promise<AgentMetrics[]> {
    const query = new SelectQuery(`
      SELECT
        m.ide_usua_whmem,
        u.nom_usua,
        COUNT(m.ide_whmem)::INT AS mensajes_enviados,
        AVG(m.tiempo_respuesta_seg_whmem)::INT AS tiempo_respuesta_promedio_seg,
        COUNT(CASE WHEN m.tiempo_respuesta_seg_whmem IS NOT NULL
              AND m.tiempo_respuesta_seg_whmem <= 86400 THEN 1 END)::INT AS respuestas_dentro_24h,
        COUNT(CASE WHEN m.tiempo_respuesta_seg_whmem > 86400 THEN 1 END)::INT AS respuestas_fuera_24h
      FROM wha_mensaje m
      INNER JOIN wha_chat c ON m.wa_id_whmem = c.wa_id_whcha
      INNER JOIN sis_usuario u ON m.ide_usua_whmem = u.ide_usua
      WHERE m.direction_whmem = '1'
        AND m.ide_usua_whmem IS NOT NULL
        AND m.fecha_whmem::date >= $1::date
        AND m.fecha_whmem::date <= $2::date
      GROUP BY m.ide_usua_whmem, u.nom_usua
      ORDER BY mensajes_enviados DESC
    `);
    query.addStringParam(1, fechaDesde);
    query.addStringParam(2, fechaHasta);
    return this.dataSource.createSelectQuery(query);
  }

  async getResponseTimeStats(
    ideEmpr: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<Record<string, any>> {
    const query = new SelectQuery(`
      SELECT
        COUNT(*)::INT AS total_respuestas,
        AVG(tiempo_respuesta_seg_whmem)::INT AS promedio_seg,
        MIN(tiempo_respuesta_seg_whmem)::INT AS min_seg,
        MAX(tiempo_respuesta_seg_whmem)::INT AS max_seg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tiempo_respuesta_seg_whmem)::INT AS mediana_seg,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tiempo_respuesta_seg_whmem)::INT AS p95_seg
      FROM wha_mensaje
      WHERE direction_whmem = '1'
        AND tiempo_respuesta_seg_whmem IS NOT NULL
        AND fecha_whmem::date >= $1::date
        AND fecha_whmem::date <= $2::date
    `);
    query.addStringParam(1, fechaDesde);
    query.addStringParam(2, fechaHasta);
    return this.dataSource.createSingleQuery(query);
  }

  async generateDailyMetrics(ideEmpr: number, fecha: string): Promise<void> {
    const query = new SelectQuery(`
      INSERT INTO wha_metrics_diaria (
        ide_empr, fecha_whmed,
        mensajes_enviados, mensajes_recibidos,
        respuestas_dentro_24h, respuestas_fuera_24h,
        tiempo_respuesta_promedio_seg,
        chats_nuevos, chats_atendidos,
        templates_enviados, mensajes_fallidos,
        hora_actualizacion
      )
      SELECT
        $1,
        $2::date,
        COUNT(CASE WHEN m.direction_whmem = '1' THEN 1 END),
        COUNT(CASE WHEN m.direction_whmem = '0' THEN 1 END),
        COUNT(CASE WHEN m.direction_whmem = '1' AND m.tiempo_respuesta_seg_whmem <= 86400 THEN 1 END),
        COUNT(CASE WHEN m.direction_whmem = '1' AND m.tiempo_respuesta_seg_whmem > 86400 THEN 1 END),
        AVG(CASE WHEN m.direction_whmem = '1' THEN m.tiempo_respuesta_seg_whmem END)::INT,
        COUNT(CASE WHEN c.fecha_crea_whcha::date = $2::date THEN 1 END),
        COUNT(CASE WHEN c.ide_usua_asignado_whcha IS NOT NULL AND c.hora_asignacion_whcha::date = $2::date THEN 1 END),
        COUNT(CASE WHEN m.direction_whmem = '1' AND m.content_type_whmem = 'template' THEN 1 END),
        COUNT(CASE WHEN m.status_whmem = 'failed' THEN 1 END),
        NOW()
      FROM wha_mensaje m
      LEFT JOIN wha_chat c ON m.wa_id_whmem = c.wa_id_whcha
      WHERE m.fecha_whmem::date = $2::date
      ON CONFLICT (ide_empr, fecha_whmed) DO UPDATE SET
        mensajes_enviados = EXCLUDED.mensajes_enviados,
        mensajes_recibidos = EXCLUDED.mensajes_recibidos,
        respuestas_dentro_24h = EXCLUDED.respuestas_dentro_24h,
        respuestas_fuera_24h = EXCLUDED.respuestas_fuera_24h,
        tiempo_respuesta_promedio_seg = EXCLUDED.tiempo_respuesta_promedio_seg,
        chats_nuevos = EXCLUDED.chats_nuevos,
        chats_atendidos = EXCLUDED.chats_atendidos,
        templates_enviados = EXCLUDED.templates_enviados,
        mensajes_fallidos = EXCLUDED.mensajes_fallidos,
        hora_actualizacion = NOW()
    `);
    query.addIntParam(1, ideEmpr);
    query.addStringParam(2, fecha);
    await this.dataSource.createQuery(query);
  }

  async logSyncEvent(dto: {
    ideEmpr: number;
    idMensaje: string;
    tipo: string;
    payloadLocal?: any;
    payloadYcloud?: any;
    estado?: string;
    error?: string;
  }): Promise<void> {
    const q = new InsertQuery('wha_ycloud_sync', 'ide_whysn');
    q.values.set('ide_empr', dto.ideEmpr);
    q.values.set('id_mensaje_whysn', dto.idMensaje);
    q.values.set('tipo_operacion', dto.tipo);
    q.values.set('estado_sync', dto.estado || 'PENDING');
    if (dto.payloadLocal) q.values.set('payload_local', JSON.stringify(dto.payloadLocal));
    if (dto.payloadYcloud) q.values.set('payload_ycloud', JSON.stringify(dto.payloadYcloud));
    if (dto.error) q.values.set('error_sync', dto.error);
    await this.dataSource.createQuery(q);
  }

  async getPendingSyncs(ideEmpr: number): Promise<SyncLogEntry[]> {
    const query = new SelectQuery(`
      SELECT *
      FROM wha_ycloud_sync
      WHERE ide_empr = $1
        AND estado_sync != 'SYNCED'
      ORDER BY hora_ingre DESC
      LIMIT 500
    `);
    query.addIntParam(1, ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  async reconcileMessage(ideEmpr: number, idMensaje: string): Promise<void> {
    const q = new UpdateQuery('wha_ycloud_sync', 'ide_whysn');
    q.values.set('estado_sync', 'SYNCED');
    q.values.set('hora_sync', new Date().toISOString());
    q.where = 'id_mensaje_whysn = $1 AND ide_empr = $2';
    q.addStringParam(1, idMensaje);
    q.addIntParam(2, ideEmpr);
    await this.dataSource.createQuery(q);
  }

  async markAsConflict(ideEmpr: number, idMensaje: string, error: string): Promise<void> {
    const q = new UpdateQuery('wha_ycloud_sync', 'ide_whysn');
    q.values.set('estado_sync', 'CONFLICT');
    q.values.set('error_sync', error);
    q.values.set('hora_sync', new Date().toISOString());
    q.where = 'id_mensaje_whysn = $1 AND ide_empr = $2';
    q.addStringParam(1, idMensaje);
    q.addIntParam(2, ideEmpr);
    await this.dataSource.createQuery(q);
  }

  async orphanLocalMessages(ideEmpr: number): Promise<string[]> {
    const query = new SelectQuery(`
      SELECT id_mensaje_whysn
      FROM wha_ycloud_sync
      WHERE ide_empr = $1
        AND tipo_operacion = 'S'
        AND estado_sync = 'PENDING'
        AND hora_ingre < NOW() - INTERVAL '10 minutes'
    `);
    query.addIntParam(1, ideEmpr);
    const rows = await this.dataSource.createSelectQuery(query);
    return rows.map((r) => r.id_mensaje_whysn);
  }

  /** Grilla completa de log de sincronización con filtros */
  async getSyncLog(dto: SyncLogQueryDto & HeaderParamsDto) {
    const condiciones: string[] = [];
    const params: any[] = [dto.ideEmpr];
    let idx = 2;

    if (dto.estado_sync) {
      condiciones.push(`ys.estado_sync = $${idx++}`);
      params.push(dto.estado_sync);
    }
    if (dto.tipo_operacion) {
      condiciones.push(`ys.tipo_operacion = $${idx++}`);
      params.push(dto.tipo_operacion);
    }
    if (dto.fechaDesde) {
      condiciones.push(`ys.hora_ingre >= $${idx++}::timestamptz`);
      params.push(dto.fechaDesde);
    }
    if (dto.fechaHasta) {
      condiciones.push(`ys.hora_ingre <= $${idx++}::timestamptz`);
      params.push(dto.fechaHasta);
    }

    const whereExtra = condiciones.length > 0 ? `AND ${condiciones.join(' AND ')}` : '';

    const query = new SelectQuery(`
      SELECT
        ys.ide_whysn,
        ys.id_mensaje_whysn,
        ys.tipo_operacion,
        ys.estado_sync,
        ys.error_sync,
        ys.hora_ingre,
        ys.hora_sync
      FROM wha_ycloud_sync ys
      WHERE ys.ide_empr = $1
        ${whereExtra}
      ORDER BY ys.hora_ingre DESC
    `, dto);
    query.addIntParam(1, dto.ideEmpr);
    for (let i = 1; i < params.length; i++) {
      query.addParam(i + 1, params[i]);
    }
    return this.dataSource.createQuery(query, 'wha_ycloud_sync');
  }
}
