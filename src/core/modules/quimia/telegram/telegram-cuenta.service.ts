import { randomBytes } from 'crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { HOST_API } from 'src/util/helpers/common-util';

import { decrypt, encrypt } from '../../sri/configuracion/crypto.util';
import { TranscripcionService } from '../transcripcion/transcripcion.service';

import { IdeUsuarioTelegramDto, SetActivoUsuarioTelegramDto } from './dto/ide-telegram.dto';
import { SaveCuentaTelegramDto } from './dto/save-cuenta-telegram.dto';
import { SaveUsuarioTelegramDto } from './dto/save-usuario-telegram.dto';
import { TelegramApiService } from './telegram-api.service';
import { normalizarTelefono } from './telegram-formato.helper';

/** Cuenta con el token ya descifrado (uso interno del bot, nunca se devuelve al front). */
export interface CuentaTelegram {
  ide_tlcue: number;
  nombre_tlcue: string;
  token: string;
  bot_username_tlcue: string | null;
  modo_tlcue: 'POLLING' | 'WEBHOOK';
  url_publica_tlcue: string | null;
  webhook_secret_tlcue: string | null;
  ultimo_update_tlcue: number;
  ide_sucu: number | null;
  usuario_erp_tlcue: string | null;
  mensaje_bienvenida_tlcue: string | null;
  activo_tlcue: boolean;
  ide_empr: number;
  // notas de voz
  audio_activo_tlcue: boolean;
  groq_api_key: string;
  audio_max_seg_tlcue: number;
  audio_respaldo_openai_tlcue: boolean;
  audio_mostrar_texto_tlcue: boolean;
  audio_vocabulario_tlcue: string | null;
}

/**
 * Base pública del backend para Telegram: la configurada en la cuenta (el mismo dominio https que
 * usa el webhook de YCloud) o, si no hay, HOST_API. Sin "/" final ni "/api".
 */
export const basePublica = (urlPublica: string | null | undefined) =>
  (urlPublica?.trim() || HOST_API()).replace(/\/+$/, '').replace(/\/api$/, '');

/** Ruta del webhook que se registra en Telegram (exige HTTPS). */
export const rutaWebhook = (ideTlcue: number, urlPublica?: string | null) =>
  `${basePublica(urlPublica)}/api/quimia/telegram/webhook/${ideTlcue}`;

/**
 * Configuración del canal Telegram (pantalla Administración → Canal Telegram): cuenta del bot y
 * números autorizados. El token se guarda cifrado y al front solo se envía enmascarado.
 */
@Injectable()
export class TelegramCuentaService {
  /** Lo registra TelegramRunnerService para reiniciar el polling/webhook al guardar la cuenta. */
  onCuentaCambiada?: (ideTlcue: number) => Promise<void>;

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly api: TelegramApiService,
    private readonly transcripcion: TranscripcionService,
  ) {}

  // ------------------------------------------------------------------ cuenta

  async getCuenta(dto: HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM tlg_usuario u WHERE u.ide_tlcue = c.ide_tlcue)::int AS total_numeros,
              (SELECT COUNT(*) FROM tlg_usuario u WHERE u.ide_tlcue = c.ide_tlcue AND u.activo_tlusu)::int AS numeros_activos,
              (SELECT COUNT(*) FROM tlg_usuario u WHERE u.ide_tlcue = c.ide_tlcue AND u.chat_id_tlusu IS NOT NULL)::int AS numeros_vinculados,
              (SELECT COUNT(*) FROM bdt_consulta q WHERE q.canal_bdcon = 'TELEGRAM' AND q.ide_empr = c.ide_empr
                  AND q.fecha_ingre >= NOW() - INTERVAL '30 days')::int AS consultas_30_dias,
              (SELECT COUNT(*) FROM qmi_transcripcion t WHERE t.ide_empr = c.ide_empr AND t.origen_qmtra = 'TELEGRAM'
                  AND t.fecha_ingre >= NOW() - INTERVAL '30 days')::int AS audios_30_dias,
              (SELECT COALESCE(SUM(t.costo_usd_qmtra), 0) FROM qmi_transcripcion t WHERE t.ide_empr = c.ide_empr
                  AND t.origen_qmtra = 'TELEGRAM' AND t.fecha_ingre >= NOW() - INTERVAL '30 days')::float AS costo_audios_30_dias
         FROM tlg_cuenta c WHERE c.ide_empr = $1 ORDER BY c.activo_tlcue DESC, c.ide_tlcue LIMIT 1`,
      [dto.ideEmpr],
    );
    const c = r.rows[0];
    if (!c) return { cuenta: null };
    const { token_tlcue, webhook_secret_tlcue: _s, groq_api_key_tlcue, ...resto } = c;
    const token = this.descifrar(token_tlcue);
    const groq = this.descifrar(groq_api_key_tlcue);
    return {
      cuenta: {
        ...resto,
        token_mascara: token ? `${token.split(':')[0]}:••••••••${token.slice(-4)}` : null,
        groq_key_mascara: groq ? `gsk_••••••••${groq.slice(-4)}` : null,
        webhook_url_esperada: rutaWebhook(c.ide_tlcue, c.url_publica_tlcue),
        host_api: HOST_API(),
        enlace_bot: c.bot_username_tlcue ? `https://t.me/${c.bot_username_tlcue}` : null,
      },
    };
  }

  async saveCuenta(dto: SaveCuentaTelegramDto & HeaderParamsDto) {
    const token = dto.token_tlcue?.trim();
    if (!dto.ide_tlcue && !token) throw new BadRequestException('Ingresa el token del bot (lo entrega @BotFather)');

    // Validar el token contra Telegram antes de guardarlo.
    let bot: { id: number; username?: string; first_name?: string } | null = null;
    if (token) {
      try {
        bot = await this.api.getMe(token);
      } catch (error) {
        throw new BadRequestException(`Telegram rechazó el token: ${(error as Error).message}`);
      }
    }

    const groqKey = dto.groq_api_key_tlcue?.trim();
    if (groqKey) {
      try {
        await this.transcripcion.validarGroqKey(groqKey);
      } catch (error) {
        throw new BadRequestException(`Groq rechazó la API key: ${(error as Error).message}`);
      }
    }
    // Las notas de voz requieren la API key de Groq (nueva o ya guardada y no quitada).
    if (dto.audio_activo_tlcue) {
      let tieneGroq = !!groqKey;
      if (!tieneGroq && dto.ide_tlcue && !dto.quitar_groq_api_key) {
        const actual = await this.dataSource.pool.query(
          `SELECT groq_api_key_tlcue FROM tlg_cuenta WHERE ide_tlcue = $1 AND ide_empr = $2`,
          [dto.ide_tlcue, dto.ideEmpr],
        );
        tieneGroq = !!this.descifrar(actual.rows[0]?.groq_api_key_tlcue ?? null);
      }
      if (!tieneGroq) {
        throw new BadRequestException('Para activar las notas de voz ingresa la API key de Groq.');
      }
    }
    const audio = {
      activo: dto.audio_activo_tlcue ?? false,
      maxSeg: dto.audio_max_seg_tlcue ?? 180,
      respaldo: dto.audio_respaldo_openai_tlcue ?? true,
      mostrar: dto.audio_mostrar_texto_tlcue ?? true,
      vocabulario: dto.audio_vocabulario_tlcue?.trim() || null,
    };

    let ide = dto.ide_tlcue;
    if (ide) {
      await this.dataSource.pool.query(
        `UPDATE tlg_cuenta SET nombre_tlcue = $2, modo_tlcue = $3, ide_sucu = $4, usuario_erp_tlcue = $5,
                mensaje_bienvenida_tlcue = $6, activo_tlcue = $7, url_publica_tlcue = $14,
                audio_activo_tlcue = $15, audio_max_seg_tlcue = $16, audio_respaldo_openai_tlcue = $17,
                audio_mostrar_texto_tlcue = $18, audio_vocabulario_tlcue = $19,
                groq_api_key_tlcue = CASE WHEN $21 THEN NULL ELSE COALESCE($20, groq_api_key_tlcue) END,
                token_tlcue = COALESCE($8, token_tlcue),
                bot_id_tlcue = COALESCE($9, bot_id_tlcue), bot_username_tlcue = COALESCE($10, bot_username_tlcue),
                bot_nombre_tlcue = COALESCE($11, bot_nombre_tlcue),
                ultimo_update_tlcue = CASE WHEN $8::text IS NULL THEN ultimo_update_tlcue ELSE 0 END,
                usuario_actua = $12, fecha_actua = NOW()
          WHERE ide_tlcue = $1 AND ide_empr = $13`,
        [
          ide,
          dto.nombre_tlcue,
          dto.modo_tlcue,
          dto.ide_sucu ?? dto.ideSucu,
          dto.usuario_erp_tlcue || 'TELEGRAM',
          dto.mensaje_bienvenida_tlcue ?? null,
          dto.activo_tlcue,
          token ? encrypt(token) : null,
          bot?.id ?? null,
          bot?.username ?? null,
          bot?.first_name ?? null,
          dto.login,
          dto.ideEmpr,
          dto.url_publica_tlcue?.trim() || null,
          audio.activo,
          audio.maxSeg,
          audio.respaldo,
          audio.mostrar,
          audio.vocabulario,
          groqKey ? encrypt(groqKey) : null,
          dto.quitar_groq_api_key === true,
        ],
      );
    } else {
      const r = await this.dataSource.pool.query(
        `INSERT INTO tlg_cuenta (nombre_tlcue, token_tlcue, bot_id_tlcue, bot_username_tlcue, bot_nombre_tlcue, modo_tlcue,
                                 webhook_secret_tlcue, ide_sucu, usuario_erp_tlcue, mensaje_bienvenida_tlcue,
                                 activo_tlcue, estado_conexion_tlcue, ultima_conexion_tlcue, ide_empr, usuario_ingre,
                                 url_publica_tlcue, audio_activo_tlcue, audio_max_seg_tlcue, audio_respaldo_openai_tlcue,
                                 audio_mostrar_texto_tlcue, audio_vocabulario_tlcue, groq_api_key_tlcue)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CONECTADO', NOW(), $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING ide_tlcue`,
        [
          dto.nombre_tlcue,
          encrypt(token),
          bot?.id ?? null,
          bot?.username ?? null,
          bot?.first_name ?? null,
          dto.modo_tlcue,
          randomBytes(24).toString('hex'),
          dto.ide_sucu ?? dto.ideSucu,
          dto.usuario_erp_tlcue || 'TELEGRAM',
          dto.mensaje_bienvenida_tlcue ?? null,
          dto.activo_tlcue,
          dto.ideEmpr,
          dto.login,
          dto.url_publica_tlcue?.trim() || null,
          audio.activo,
          audio.maxSeg,
          audio.respaldo,
          audio.mostrar,
          audio.vocabulario,
          groqKey ? encrypt(groqKey) : null,
        ],
      );
      ide = r.rows[0].ide_tlcue;
    }

    // Aplicar el modo (activar/detener polling, registrar/quitar webhook).
    let aviso: string | null = null;
    try {
      await this.onCuentaCambiada?.(ide);
    } catch (error) {
      aviso = (error as Error).message;
    }
    return { message: 'ok', ide_tlcue: ide, aviso };
  }

  /** getMe + getWebhookInfo: confirma que el token funciona y cómo recibe los mensajes. */
  async probarConexion(ideTlcue: number, ideEmpr: number) {
    const cuenta = await this.getCuentaInterna(ideTlcue, ideEmpr);
    try {
      const [bot, webhook] = await Promise.all([this.api.getMe(cuenta.token), this.api.getWebhookInfo(cuenta.token)]);
      await this.dataSource.pool.query(
        `UPDATE tlg_cuenta SET estado_conexion_tlcue = 'CONECTADO', ultima_conexion_tlcue = NOW(), error_tlcue = NULL,
                bot_id_tlcue = $2, bot_username_tlcue = $3, bot_nombre_tlcue = $4, webhook_url_tlcue = NULLIF($5, '')
          WHERE ide_tlcue = $1`,
        [ideTlcue, bot.id, bot.username ?? null, bot.first_name ?? null, webhook.url],
      );
      return {
        ok: true,
        bot: { id: bot.id, username: bot.username, nombre: bot.first_name, enlace: `https://t.me/${bot.username}` },
        webhook: { url: webhook.url || null, pendientes: webhook.pending_update_count, ultimo_error: webhook.last_error_message ?? null },
        modo: cuenta.modo_tlcue,
      };
    } catch (error) {
      await this.registrarError(ideTlcue, (error as Error).message);
      return { ok: false, error: (error as Error).message };
    }
  }

  async getCuentaInterna(ideTlcue: number, ideEmpr?: number): Promise<CuentaTelegram> {
    const r = await this.dataSource.pool.query(
      `SELECT * FROM tlg_cuenta WHERE ide_tlcue = $1 ${ideEmpr ? 'AND ide_empr = $2' : ''}`,
      ideEmpr ? [ideTlcue, ideEmpr] : [ideTlcue],
    );
    if (!r.rows.length) throw new BadRequestException('Cuenta de Telegram no encontrada');
    const c = r.rows[0];
    return {
      ...c,
      token: this.descifrar(c.token_tlcue),
      groq_api_key: this.descifrar(c.groq_api_key_tlcue),
      ultimo_update_tlcue: Number(c.ultimo_update_tlcue ?? 0),
    };
  }

  async getCuentasActivas(): Promise<CuentaTelegram[]> {
    const r = await this.dataSource.pool.query(`SELECT ide_tlcue FROM tlg_cuenta WHERE activo_tlcue`);
    return Promise.all(r.rows.map((x) => this.getCuentaInterna(x.ide_tlcue)));
  }

  async registrarError(ideTlcue: number, error: string | null) {
    await this.dataSource.pool.query(
      `UPDATE tlg_cuenta SET estado_conexion_tlcue = $2, error_tlcue = $3,
              ultima_conexion_tlcue = CASE WHEN $3::text IS NULL THEN NOW() ELSE ultima_conexion_tlcue END
        WHERE ide_tlcue = $1`,
      [ideTlcue, error ? 'ERROR' : 'CONECTADO', error ? error.slice(0, 1000) : null],
    );
  }

  async guardarOffset(ideTlcue: number, offset: number) {
    await this.dataSource.pool.query(`UPDATE tlg_cuenta SET ultimo_update_tlcue = $2 WHERE ide_tlcue = $1`, [ideTlcue, offset]);
  }

  private descifrar(valor: string | null): string {
    if (!valor) return '';
    try {
      return decrypt(valor);
    } catch {
      return '';
    }
  }

  // ------------------------------------------------------------------ números autorizados

  async getUsuarios(ideTlcue: number, ideEmpr: number) {
    const r = await this.dataSource.pool.query(
      `SELECT u.ide_tlusu, u.ide_tlcue, u.telefono_tlusu, u.alias_tlusu, u.activo_tlusu, u.observacion_tlusu,
              u.chat_id_tlusu IS NOT NULL AS vinculado, u.telegram_username_tlusu, u.fecha_vinculacion_tlusu,
              u.ultimo_acceso_tlusu, u.total_consultas_tlusu, u.usuario_ingre, u.fecha_ingre, u.fecha_actua
         FROM tlg_usuario u
        WHERE u.ide_tlcue = $1 AND u.ide_empr = $2
        ORDER BY u.activo_tlusu DESC, u.alias_tlusu`,
      [ideTlcue, ideEmpr],
    );
    return { rowCount: r.rows.length, rows: r.rows };
  }

  async saveUsuario(dto: SaveUsuarioTelegramDto & HeaderParamsDto) {
    const telefono = normalizarTelefono(dto.telefono_tlusu);
    if (telefono.length < 11) {
      throw new BadRequestException('Ingresa el número con código de país (ej. 593991234567) o como 0991234567');
    }
    const duplicado = await this.dataSource.pool.query(
      `SELECT 1 FROM tlg_usuario WHERE ide_tlcue = $1 AND telefono_tlusu = $2 AND ide_tlusu <> COALESCE($3, 0)`,
      [dto.ide_tlcue, telefono, dto.ide_tlusu ?? null],
    );
    if (duplicado.rows.length) throw new BadRequestException(`El número ${telefono} ya está registrado`);

    if (dto.ide_tlusu) {
      // Si cambia el número, el vínculo anterior deja de valer.
      await this.dataSource.pool.query(
        `UPDATE tlg_usuario SET
            chat_id_tlusu = CASE WHEN telefono_tlusu = $2 THEN chat_id_tlusu END,
            telegram_user_id_tlusu = CASE WHEN telefono_tlusu = $2 THEN telegram_user_id_tlusu END,
            fecha_vinculacion_tlusu = CASE WHEN telefono_tlusu = $2 THEN fecha_vinculacion_tlusu END,
            telefono_tlusu = $2, alias_tlusu = $3, activo_tlusu = $4, observacion_tlusu = $5,
            usuario_actua = $6, fecha_actua = NOW()
          WHERE ide_tlusu = $1 AND ide_empr = $7`,
        [dto.ide_tlusu, telefono, dto.alias_tlusu, dto.activo_tlusu, dto.observacion_tlusu ?? null, dto.login, dto.ideEmpr],
      );
      return { message: 'ok', ide_tlusu: dto.ide_tlusu };
    }
    const r = await this.dataSource.pool.query(
      `INSERT INTO tlg_usuario (ide_tlcue, telefono_tlusu, alias_tlusu, activo_tlusu, observacion_tlusu, ide_empr, usuario_ingre)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ide_tlusu`,
      [dto.ide_tlcue, telefono, dto.alias_tlusu, dto.activo_tlusu, dto.observacion_tlusu ?? null, dto.ideEmpr, dto.login],
    );
    return { message: 'ok', ide_tlusu: r.rows[0].ide_tlusu };
  }

  async setActivoUsuario(dto: SetActivoUsuarioTelegramDto & HeaderParamsDto) {
    await this.dataSource.pool.query(
      `UPDATE tlg_usuario SET activo_tlusu = $2,
              chat_id_tlusu = CASE WHEN $3 THEN NULL ELSE chat_id_tlusu END,
              telegram_user_id_tlusu = CASE WHEN $3 THEN NULL ELSE telegram_user_id_tlusu END,
              fecha_vinculacion_tlusu = CASE WHEN $3 THEN NULL ELSE fecha_vinculacion_tlusu END,
              usuario_actua = $4, fecha_actua = NOW()
        WHERE ide_tlusu = $1 AND ide_empr = $5`,
      [dto.ide_tlusu, dto.activo, dto.desvincular === true, dto.login, dto.ideEmpr],
    );
    return { message: 'ok' };
  }

  async deleteUsuario(dto: IdeUsuarioTelegramDto & HeaderParamsDto) {
    // Las consultas conservan el teléfono en bdt_consulta.telefono_bdcon (historial intacto).
    await this.dataSource.pool.query(`DELETE FROM tlg_usuario WHERE ide_tlusu = $1 AND ide_empr = $2`, [
      dto.ide_tlusu,
      dto.ideEmpr,
    ]);
    return { message: 'ok' };
  }

  /** Últimas preguntas recibidas por Telegram (quién, qué y si fue útil). */
  async getConsultas(ideTlcue: number, ideEmpr: number) {
    const r = await this.dataSource.pool.query(
      `SELECT q.ide_bdcon, q.fecha_ingre, q.telefono_bdcon, u.alias_tlusu, q.pregunta_bdcon, q.respuesta_bdcon,
              q.modo_bdcon, q.herramientas_bdcon, q.sin_dato_bdcon, q.util_bdcon, q.entrada_bdcon,
              t.duracion_seg_qmtra, t.proveedor_qmtra, t.respaldo_qmtra, t.costo_usd_qmtra,
              COALESCE(q.tokens_entrada_bdcon, 0) + COALESCE(q.tokens_salida_bdcon, 0) AS tokens
         FROM bdt_consulta q
         LEFT JOIN tlg_usuario u ON u.ide_tlusu = q.ide_tlusu
         LEFT JOIN qmi_transcripcion t ON t.ide_qmtra = q.ide_qmtra
        WHERE q.canal_bdcon = 'TELEGRAM' AND q.ide_empr = $2
          AND (u.ide_tlcue = $1 OR u.ide_tlcue IS NULL)
        ORDER BY q.ide_bdcon DESC
        LIMIT 100`,
      [ideTlcue, ideEmpr],
    );
    return { rowCount: r.rows.length, rows: r.rows };
  }
}
