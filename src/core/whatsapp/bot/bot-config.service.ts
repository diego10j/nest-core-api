import { Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { WhatsappGateway } from '../whatsapp.gateway';

import { BotConfigQueryDto } from './dto/bot-config-query.dto';
import { SaveBotConfigDto } from './dto/save-bot-config.dto';

const CACHE_ACTIVO     = 'bot_activo:';
const CACHE_CONFIG     = 'bot_config:';
const CACHE_TTL_S      = 60;    // estado activo/inactivo del bot (1 min)
const CACHE_CONFIG_TTL = 3600;  // config completa + prompt (1 hora, rara vez cambia)

export interface BotConfigData {
  ide_whbco: number;
  ide_whcue: number;
  activo_manual: boolean;
  usa_horario: boolean;
  ide_tihor: number;
  nombre_bot: string;
  nombre_empresa: string;
  prompt_sistema: string;
  resp_ubicacion: string | null;
  resp_horario: string | null;
  resp_envio: string | null;
  resp_catalogo: string | null;
  monto_envio_gratis: number;
  max_intentos_fallo: number;
  lat_empresa: number | null;
  lng_empresa: number | null;
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
    if (cached) {
      const parsed = JSON.parse(cached) as BotConfigData;
      // Invalidar cache si resp_ubicacion no existe o es null (objeto pre-migración o cacheado con valores vacíos)
      if (!('resp_ubicacion' in parsed) || parsed.resp_ubicacion === null) {
        await this.dataSource.redisClient.del(cacheKey);
      } else {
        return parsed;
      }
    }

    const q = new SelectQuery(`
      SELECT bc.ide_whbco, bc.ide_whcue, bc.activo_manual, bc.usa_horario, bc.ide_tihor,
             bc.nombre_bot, bc.prompt_sistema,
             bc.resp_ubicacion, bc.resp_horario, bc.resp_envio, bc.resp_catalogo,
             bc.monto_envio_gratis, bc.max_intentos_fallo,
             COALESCE(e.nom_corto_empr, 'Mi Empresa') AS nombre_empresa,
             e.latitud_empr  AS lat_empresa,
             e.longitud_empr AS lng_empresa
      FROM wha_bot_config bc
      LEFT JOIN wha_cuenta cu ON cu.ide_whcue = bc.ide_whcue
      LEFT JOIN sis_empresa e ON e.ide_empr = COALESCE(bc.ide_empr, cu.ide_empr)
      WHERE bc.ide_whcue = $1
      LIMIT 1
    `);
    q.addIntParam(1, ideWhcue);
    const row = await this.dataSource.createSingleQuery(q);
    if (!row) return null;
    await this.dataSource.redisClient.setex(cacheKey, CACHE_CONFIG_TTL, JSON.stringify(row));
    return row as BotConfigData;
  }

  /**
   * Devuelve TRUE si el bot debe responder ahora:
   *   activo_manual = TRUE  OR  (usa_horario = TRUE AND estamos en horario del bot)
   *
   * El horario automático solo aplica en producción (MODE=PROD). En DEV se ignora
   * para no interrumpir pruebas con activaciones automáticas fuera de nuestro control —
   * el bot solo se activa ahí de forma explícita vía `activo_manual`.
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
    if (envs.mode === 'PROD' && config.usa_horario && config.ide_tihor) {
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

  /** Actualiza la configuración editable del bot (nombre, prompt, respuestas fijas, parámetros) */
  async updateConfigBot(ideWhcue: number, data: Partial<Pick<BotConfigData,
    'nombre_bot' | 'prompt_sistema' | 'resp_ubicacion' | 'resp_horario' | 'resp_envio' | 'resp_catalogo' |
    'monto_envio_gratis' | 'max_intentos_fallo'
  >>): Promise<void> {
    const upd = new UpdateQuery('wha_bot_config', 'ide_whbco');
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) upd.values.set(k, v);
    }
    upd.where = 'ide_whcue = $1';
    upd.addIntParam(1, ideWhcue);
    await this.dataSource.createQuery(upd);
    await this.dataSource.redisClient.del(`${CACHE_CONFIG}${ideWhcue}`);
    await this.invalidarCache(ideWhcue);
    // Pre-calentar caché con los nuevos valores
    await this.getConfig(ideWhcue).catch(() => {});
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
    return { ...row, activo_ahora: activo, ...this.getEnvironmentInfo() };
  }

  /**
   * Info del ambiente del backend (MODE=DEV|PROD), para que el front pueda mostrar
   * un indicador visual y explicar por qué no se auto-activan chats nuevos ni el
   * horario automático fuera de producción (ver isBotActive / evaluarHorarioBot).
   */
  getEnvironmentInfo(): { mode: string; esDev: boolean } {
    return { mode: envs.mode, esDev: envs.mode !== 'PROD' };
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

  /** Lista todas las configuraciones de bot de la empresa con datos de la cuenta */
  async getConfigs(dto: BotConfigQueryDto & HeaderParamsDto) {
    const query = new SelectQuery(`
      SELECT
        bc.ide_whbco,
        bc.ide_whcue,
        cu.nombre_whcue,
        cu.id_telefono_whcue,
        cu.tipo_whcue,
        bc.activo_manual,
        bc.usa_horario,
        bc.ide_tihor,
        bc.nombre_bot,
        bc.monto_envio_gratis,
        bc.max_intentos_fallo,
        bc.hora_ingre,
        bc.hora_actua,
        COALESCE(e.nom_corto_empr, 'Mi Empresa') AS nombre_empresa
      FROM wha_bot_config bc
      INNER JOIN wha_cuenta cu ON cu.ide_whcue = bc.ide_whcue
      LEFT JOIN sis_empresa e ON e.ide_empr = COALESCE(bc.ide_empr, cu.ide_empr)
      WHERE cu.ide_empr = $1
      ORDER BY bc.hora_ingre DESC
    `, dto);
    query.addIntParam(1, dto.ideEmpr);
    return this.dataSource.createQuery(query, 'wha_bot_config');
  }

  /** Cuentas WhatsApp de la empresa que aún no tienen configuración de bot */
  async getCuentasSinConfig(ideEmpr: number) {
    const query = new SelectQuery(`
      SELECT cu.ide_whcue AS value, cu.nombre_whcue AS label
      FROM wha_cuenta cu
      WHERE cu.ide_empr = $1
        AND cu.activo_whcue = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM wha_bot_config bc WHERE bc.ide_whcue = cu.ide_whcue
        )
      ORDER BY cu.nombre_whcue
    `);
    query.addIntParam(1, ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  /** Historial global de activaciones del bot (todas las cuentas de la empresa) */
  async getLogsGlobal(dto: BotConfigQueryDto & HeaderParamsDto) {
    const query = new SelectQuery(`
      SELECT
        l.ide_whbal,
        l.ide_whcue,
        cu.nombre_whcue,
        cu.id_telefono_whcue,
        l.accion,
        l.origen,
        l.observacion,
        l.hora_ingre,
        u.nom_usua
      FROM wha_bot_activacion_log l
      INNER JOIN wha_cuenta cu ON cu.ide_whcue = l.ide_whcue
      LEFT JOIN sis_usuario u ON l.ide_usua = u.ide_usua
      WHERE cu.ide_empr = $1
      ORDER BY l.hora_ingre DESC
    `, dto);
    query.addIntParam(1, dto.ideEmpr);
    return this.dataSource.createQuery(query, 'wha_bot_activacion_log');
  }

  /** Activar/desactivar el bot desde la grilla de administración (por ide_whbco) */
  async setActivoBotConfig(ideWhbco: number, activo: boolean, ideUsua: number): Promise<void> {
    const q = new SelectQuery(`
      SELECT ide_whcue FROM wha_bot_config WHERE ide_whbco = $1 LIMIT 1
    `);
    q.addIntParam(1, ideWhbco);
    const config = await this.dataSource.createSingleQuery(q) as { ide_whcue: number } | null;

    if (!config) return;

    await this.toggleManual(config.ide_whcue, activo, ideUsua);
  }

  /** Crea o actualiza una configuración de bot para una cuenta */
  async saveConfig(dto: SaveBotConfigDto & HeaderParamsDto): Promise<void> {
    const existe = new SelectQuery(`SELECT 1 FROM wha_bot_config WHERE ide_whcue = $1 LIMIT 1`);
    existe.addIntParam(1, dto.ide_whcue);
    const row = await this.dataSource.createSingleQuery(existe);

    if (row) {
      const upd = new UpdateQuery('wha_bot_config', 'ide_whbco');
      if (dto.nombre_bot !== undefined) upd.values.set('nombre_bot', dto.nombre_bot);
      if (dto.prompt_sistema !== undefined) upd.values.set('prompt_sistema', dto.prompt_sistema);
      if (dto.resp_ubicacion !== undefined) upd.values.set('resp_ubicacion', dto.resp_ubicacion);
      if (dto.resp_horario !== undefined) upd.values.set('resp_horario', dto.resp_horario);
      if (dto.resp_envio !== undefined) upd.values.set('resp_envio', dto.resp_envio);
      if (dto.resp_catalogo !== undefined) upd.values.set('resp_catalogo', dto.resp_catalogo);
      if (dto.monto_envio_gratis !== undefined) upd.values.set('monto_envio_gratis', dto.monto_envio_gratis);
      if (dto.max_intentos_fallo !== undefined) upd.values.set('max_intentos_fallo', dto.max_intentos_fallo);
      if (dto.activo_manual !== undefined) upd.values.set('activo_manual', dto.activo_manual);
      if (dto.usa_horario !== undefined) upd.values.set('usa_horario', dto.usa_horario);
      if (dto.ide_tihor !== undefined) upd.values.set('ide_tihor', dto.ide_tihor);
      upd.where = 'ide_whcue = $1';
      upd.addIntParam(1, dto.ide_whcue);
      await this.dataSource.createQuery(upd);
    } else {
      const ins = new InsertQuery('wha_bot_config', 'ide_whbco');
      ins.values.set('ide_whcue', dto.ide_whcue);
      ins.values.set('activo_manual', dto.activo_manual ?? false);
      ins.values.set('usa_horario', dto.usa_horario ?? true);
      if (dto.ide_tihor !== undefined) ins.values.set('ide_tihor', dto.ide_tihor);
      const nombreBotDefault = dto.nombre_bot ?? 'QuimIA';
      ins.values.set('nombre_bot', nombreBotDefault);
      ins.values.set('prompt_sistema', dto.prompt_sistema ?? this.getDefaultPrompt(nombreBotDefault));
      ins.values.set('monto_envio_gratis', dto.monto_envio_gratis ?? 100);
      ins.values.set('max_intentos_fallo', dto.max_intentos_fallo ?? 3);
      await this.dataSource.createQuery(ins);
    }

    await this.invalidarCache(dto.ide_whcue);
    // Pre-calentar caché con los nuevos valores
    await this.getConfig(dto.ide_whcue).catch(() => {});
    this.logger.log(`[BotConfig] Config guardada para ide_whcue=${dto.ide_whcue}`);
  }

  private getDefaultPrompt(nombreBot: string): string {
    return `Eres ${nombreBot}, asistente comercial virtual.

=== PERSONALIDAD ===
Eres amable, cálida y profesional. Usa emojis con naturalidad.
Usa *negrita* para datos clave. Responde en español.
Si no puedes responder algo, invita al cliente a escribir SALIR.

=== INSTRUCCIONES DE COTIZACIÓN ===
Cuando el cliente quiera cotizar, solicita: nombre completo, correo, productos con cantidades y dirección.

=== RESPUESTA_UBICACION ===
📍 *¡Con gusto te indico cómo llegar!*

[COMPLETA CON LA DIRECCIÓN Y REFERENCIA DE TU EMPRESA]

¿Puedo ayudarte con algo más?

=== RESPUESTA_HORARIO ===
🕒 *Nuestros horarios de atención son:*

[COMPLETA CON LOS HORARIOS DE TU EMPRESA]

¿Hay algo más en que pueda ayudarte?

=== RESPUESTA_ENVIO ===
🚚 *¡Claro que sí, realizamos envíos!*

[COMPLETA CON LA POLÍTICA DE ENVÍOS DE TU EMPRESA]

¿Te gustaría que te ayude con una cotización?

=== RESPUESTA_CATALOGO ===
📦 *Explora nuestros productos:*

[COMPLETA CON LOS LINKS DE TU CATÁLOGO]

¿Te gustaría que te ayude con una cotización personalizada? 🧪`;
  }

  private async invalidarCache(ideWhcue: number): Promise<void> {
    await this.dataSource.redisClient.del(`${CACHE_ACTIVO}${ideWhcue}`);
    await this.dataSource.redisClient.del(`${CACHE_CONFIG}${ideWhcue}`);
  }
}
