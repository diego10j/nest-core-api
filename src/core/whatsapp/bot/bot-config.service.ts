import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { WhatsappGateway } from '../whatsapp.gateway';

const CACHE_ACTIVO  = 'bot_activo:';
const CACHE_CONFIG  = 'bot_config:';
const CACHE_TTL_S   = 60;

export interface BotConfigData {
  ide_whbco: number;
  ide_whcue: number;
  activo_manual: boolean;
  usa_horario: boolean;
  ide_tihor: number;
  nombre_bot: string;
  prompt_sistema: string;
  template_saludo: string;
  horario_atencion: string;
  monto_envio_gratis: number;
  max_intentos_fallo: number;
}

@Injectable()
export class BotConfigService {
  private readonly logger = new Logger(BotConfigService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly whatsappGateway: WhatsappGateway,
  ) {}

  /**
   * Carga la configuración completa del bot desde wha_bot_config (con caché Redis)
   */
  async getConfig(ideWhcue: number): Promise<BotConfigData | null> {
    const cacheKey = `${CACHE_CONFIG}${ideWhcue}`;
    const cached = await this.dataSource.redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached) as BotConfigData;

    const q = new SelectQuery(`
      SELECT ide_whbco, ide_whcue, activo_manual, usa_horario, ide_tihor,
             nombre_bot, prompt_sistema, template_saludo, horario_atencion,
             monto_envio_gratis, max_intentos_fallo
      FROM wha_bot_config
      WHERE ide_whcue = $1
      LIMIT 1
    `);
    q.addIntParam(1, ideWhcue);
    const row = await this.dataSource.createSingleQuery(q);
    if (!row) return null;
    await this.dataSource.redisClient.setex(cacheKey, 300, JSON.stringify(row));
    return row as BotConfigData;
  }

  /**
   * Devuelve TRUE si el bot debe responder ahora:
   *   activo_manual = TRUE  OR  (usa_horario = TRUE AND estamos en horario del bot)
   */
  async isBotActive(ideWhcue: number): Promise<boolean> {
    const cached = await this.dataSource.redisClient.get(`${CACHE_ACTIVO}${ideWhcue}`);
    if (cached !== null) return cached === '1';

    const config = await this.getConfig(ideWhcue);
    if (!config) {
      await this.dataSource.redisClient.setex(`${CACHE_ACTIVO}${ideWhcue}`, CACHE_TTL_S, '0');
      return false;
    }

    let enHorario = false;
    if (config.usa_horario && config.ide_tihor) {
      enHorario = await this.estaEnHorario(config.ide_tihor);
    }

    const activo = config.activo_manual || enHorario;
    await this.dataSource.redisClient.setex(`${CACHE_ACTIVO}${ideWhcue}`, CACHE_TTL_S, activo ? '1' : '0');
    return activo;
  }

  /**
   * Obtiene ide_whcue de la cuenta activa para una empresa
   */
  async getIdeWhcuePorEmpresa(ideEmpr: number): Promise<number | null> {
    const cacheKey = `wha_cue:${ideEmpr}`;
    const cached = await this.dataSource.redisClient.get(cacheKey);
    if (cached) return parseInt(cached, 10);

    const q = new SelectQuery(`
      SELECT ide_whcue FROM wha_cuenta
      WHERE ide_empr = $1 AND activo_whcue = TRUE
      LIMIT 1
    `);
    q.addIntParam(1, ideEmpr);
    const row = await this.dataSource.createSingleQuery(q);
    if (!row) return null;
    await this.dataSource.redisClient.setex(cacheKey, 3600, String(row.ide_whcue));
    return row.ide_whcue as number;
  }

  /**
   * Activa o desactiva el bot manualmente desde el front
   */
  async toggleManual(ideWhcue: number, activar: boolean, ideUsua: number, observacion?: string): Promise<void> {
    const upd = new UpdateQuery('wha_bot_config', 'ide_whbco');
    upd.values.set('activo_manual', activar);
    upd.where = 'ide_whcue = $1';
    upd.addIntParam(1, ideWhcue);
    await this.dataSource.createQuery(upd);

    await this.insertLog(ideWhcue, activar ? 'A' : 'D', 'MANUAL', ideUsua, observacion);
    await this.invalidarCache(ideWhcue);
    this.whatsappGateway.emitBotStatus(ideWhcue, activar);
    this.logger.log(`Bot ${activar ? 'ACTIVADO' : 'DESACTIVADO'} manualmente en cuenta ${ideWhcue}`);
  }

  /** Actualiza la configuración editable del bot (nombre, prompt, template, horario) */
  async updateConfigBot(ideWhcue: number, data: Partial<Pick<BotConfigData,
    'nombre_bot' | 'prompt_sistema' | 'template_saludo' | 'horario_atencion' | 'monto_envio_gratis' | 'max_intentos_fallo'
  >>): Promise<void> {
    const upd = new UpdateQuery('wha_bot_config', 'ide_whbco');
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) upd.values.set(k, v);
    }
    upd.where = 'ide_whcue = $1';
    upd.addIntParam(1, ideWhcue);
    await this.dataSource.createQuery(upd);
    // Invalidar caché de config
    await this.dataSource.redisClient.del(`${CACHE_CONFIG}${ideWhcue}`);
    await this.invalidarCache(ideWhcue);
  }

  /**
   * Llamado por el cron para activar/desactivar por horario
   */
  async setActivoPorHorario(ideWhcue: number, activar: boolean): Promise<void> {
    // Solo registrar log si cambió el estado para evitar spam
    const cacheKey = `${CACHE_ACTIVO}${ideWhcue}`;
    const prev = await this.dataSource.redisClient.get(cacheKey);
    const prevState = prev === '1';
    if (prevState === activar) return;

    await this.insertLog(ideWhcue, activar ? 'A' : 'D', 'HORARIO');
    await this.invalidarCache(ideWhcue);
    this.whatsappGateway.emitBotStatus(ideWhcue, activar);
    this.logger.log(`Bot ${activar ? 'ACTIVADO' : 'DESACTIVADO'} por horario en cuenta ${ideWhcue}`);
  }

  async getStatus(ideWhcue: number) {
    const q = new SelectQuery(`
      SELECT
        cfg.activo_manual,
        cfg.usa_horario,
        h.nombre_tihor AS nombre_horario,
        (SELECT MAX(hora_ingre) FROM wha_bot_activacion_log WHERE ide_whcue = $1) AS ultima_activacion,
        (SELECT accion        FROM wha_bot_activacion_log WHERE ide_whcue = $1 ORDER BY hora_ingre DESC LIMIT 1) AS ultima_accion
      FROM wha_bot_config cfg
      LEFT JOIN sis_tipo_horario h ON h.ide_tihor = cfg.ide_tihor
      WHERE cfg.ide_whcue = $1
    `);
    q.addIntParam(1, ideWhcue);
    const row = await this.dataSource.createSingleQuery(q);
    const activo = await this.isBotActive(ideWhcue);
    return { ...row, activo_ahora: activo };
  }

  async getLogs(ideWhcue: number, limit = 50) {
    const q = new SelectQuery(`
      SELECT
        l.ide_whbal, l.accion, l.origen, l.observacion, l.hora_ingre,
        u.nom_usua
      FROM wha_bot_activacion_log l
      LEFT JOIN sis_usuario u ON l.ide_usua = u.ide_usua
      WHERE l.ide_whcue = $1
      ORDER BY l.hora_ingre DESC
      LIMIT ${limit}
    `);
    q.addIntParam(1, ideWhcue);
    return this.dataSource.createSelectQuery(q);
  }

  /** Retorna todas las configs que usan horario, para el cron */
  async getAllConfigsConHorario(): Promise<{ ide_whcue: number; ide_tihor: number }[]> {
    const q = new SelectQuery(`
      SELECT ide_whcue, ide_tihor
      FROM wha_bot_config
      WHERE usa_horario = TRUE AND ide_tihor IS NOT NULL
    `);
    return this.dataSource.createSelectQuery(q);
  }

  /** Verifica si el instante actual está dentro de algún tramo de sis_horario para un ide_tihor */
  async estaEnHorario(ideTihor: number): Promise<boolean> {
    const q = new SelectQuery(`
      SELECT 1
      FROM sis_horario
      WHERE ide_tihor   = $1
        AND activo_hora = TRUE
        AND dia_hora    = (
          -- Convertir DOW de PostgreSQL (0=Dom) al esquema de sis_horario (1=Lun..7=Dom)
          CASE EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Guayaquil')::INT
            WHEN 0 THEN 7
            ELSE EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Guayaquil')::INT
          END
        )
        AND (NOW() AT TIME ZONE 'America/Guayaquil')::TIME
            BETWEEN hora_inicio_hora AND hora_fin_hora
      LIMIT 1
    `);
    q.addIntParam(1, ideTihor);
    const row = await this.dataSource.createSingleQuery(q);
    return !!row;
  }

  private async insertLog(ideWhcue: number, accion: 'A' | 'D', origen: 'MANUAL' | 'HORARIO', ideUsua?: number, observacion?: string): Promise<void> {
    const ins = new InsertQuery('wha_bot_activacion_log', 'ide_whbal');
    ins.values.set('ide_whcue', ideWhcue);
    ins.values.set('accion', accion);
    ins.values.set('origen', origen);
    if (ideUsua) ins.values.set('ide_usua', ideUsua);
    if (observacion) ins.values.set('observacion', observacion);
    await this.dataSource.createQuery(ins);
  }

  async crearConfigMinima(ideWhcue: number): Promise<void> {
    const existe = new SelectQuery(`SELECT 1 FROM wha_bot_config WHERE ide_whcue = $1 LIMIT 1`);
    existe.addIntParam(1, ideWhcue);
    const row = await this.dataSource.createSingleQuery(existe);
    if (row) return; // ya existe

    const ins = new InsertQuery('wha_bot_config', 'ide_whbco');
    ins.values.set('ide_whcue', ideWhcue);
    ins.values.set('activo_manual', false);
    ins.values.set('usa_horario', false);
    ins.values.set('nombre_bot', 'QuimIA');
    ins.values.set('max_intentos_fallo', 3);
    ins.values.set('monto_envio_gratis', 100);
    await this.dataSource.createQuery(ins);
    this.logger.log(`[BotConfig] Config mínima creada para ide_whcue=${ideWhcue}`);
    await this.invalidarCache(ideWhcue);
  }

  private async invalidarCache(ideWhcue: number): Promise<void> {
    await this.dataSource.redisClient.del(`${CACHE_ACTIVO}${ideWhcue}`);
    await this.dataSource.redisClient.del(`${CACHE_CONFIG}${ideWhcue}`);
  }
}
