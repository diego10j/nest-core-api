import { Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { BotSessionQueryDto } from './dto/bot-session-query.dto';
import { DatosSesion } from './interfaces/bot-session.interface';
import { BotState } from './interfaces/bot-state.enum';

export interface BotSesion {
  ide_whbse: number;
  ide_whcha: number;
  ide_whcue: number;
  estado: BotState;
  datos_sesion: DatosSesion;
  activa: boolean;
  intentos_fallo: number;
}

@Injectable()
export class BotSessionService {
  private readonly logger = new Logger(BotSessionService.name);

  constructor(private readonly dataSource: DataSourceService) {}

  async getOrCreate(ideWhcha: number, ideWhcue: number): Promise<{ sesion: BotSesion; expirada: boolean }> {
    const result = await this.getActiva(ideWhcha);
    if (result.sesion) return result;

    const ins = new InsertQuery('wha_bot_sesion', 'ide_whbse');
    ins.values.set('ide_whcha', ideWhcha);
    ins.values.set('ide_whcue', ideWhcue);
    ins.values.set('estado', BotState.INICIO);
    ins.values.set('datos_sesion', JSON.stringify({ productos: [] }));
    ins.values.set('activa', true);
    ins.values.set('intentos_fallo', 0);
    await this.dataSource.createQuery(ins);

    const created = await this.getActiva(ideWhcha);
    return { sesion: created.sesion, expirada: result.expirada };
  }

  // Estándar bots conversacionales: 20 min sin actividad → sesión expira
  // Parametrizable: cambiar SESSION_TTL_MINUTES según necesidad del negocio
  static readonly SESSION_TTL_MINUTES = 20;

  async getActiva(ideWhcha: number): Promise<{ sesion: BotSesion | null; expirada: boolean }> {
    const q = new SelectQuery(`
      SELECT ide_whbse, ide_whcha, ide_whcue, estado,
             datos_sesion, activa, intentos_fallo, hora_actua
      FROM wha_bot_sesion
      WHERE ide_whcha = $1 AND activa = TRUE
      ORDER BY ide_whbse DESC
      LIMIT 1
    `);
    q.addParam(1, ideWhcha);
    const row = await this.dataSource.createSingleQuery(q);
    if (!row) return { sesion: null, expirada: false };

    // Estados terminales no cuentan el timeout (INICIO/ESPERANDO_CONFIRMACION permiten más tiempo)
    const estadosConTimeout = ['ATENCION_LIBRE', 'PREGUNTA_ES_CLIENTE', 'IDENTIFICACION',
      'DATOS_NUEVO_CLIENTE', 'SELECCION_PRODUCTOS', 'SELECCION_MULTIPLE', 'ESPERANDO_CANTIDAD',
      'ESPERANDO_USO_PRODUCTO',
      'CONFIRMACION_PRODUCTOS', 'DATOS_ENVIO', 'DATOS_PAGO'];

    if (row.hora_actua && estadosConTimeout.includes(row.estado)) {
      const minutosSinActividad = (Date.now() - new Date(row.hora_actua).getTime()) / 60_000;
      if (minutosSinActividad > BotSessionService.SESSION_TTL_MINUTES) {
        await this.dataSource.pool.query(
          `UPDATE wha_bot_sesion SET activa = FALSE, estado = 'EXPIRADO', hora_actua = NOW()
           WHERE ide_whbse = $1`,
          [row.ide_whbse],
        );
        return { sesion: null, expirada: true };
      }
    }

    // Sesiones muy largas en INICIO/ESPERANDO (sin avanzar) → expiran en 4h
    if (row.hora_actua && !estadosConTimeout.includes(row.estado)) {
      const horasSinActividad = (Date.now() - new Date(row.hora_actua).getTime()) / 3_600_000;
      if (horasSinActividad > 4) {
        await this.dataSource.pool.query(
          `UPDATE wha_bot_sesion SET activa = FALSE, estado = 'EXPIRADO', hora_actua = NOW()
           WHERE ide_whbse = $1`,
          [row.ide_whbse],
        );
        return { sesion: null, expirada: false };  // no avanzó → no despedida
      }
    }

    const sesion: BotSesion = {
      ...row,
      datos_sesion: typeof row.datos_sesion === 'string'
        ? JSON.parse(row.datos_sesion)
        : (row.datos_sesion as DatosSesion),
    } as BotSesion;
    return { sesion, expirada: false };
  }

  async update(ideWhbse: number, estado: BotState, datos: DatosSesion): Promise<void> {
    const upd = new UpdateQuery('wha_bot_sesion', 'ide_whbse');
    upd.values.set('estado', estado);
    upd.values.set('datos_sesion', JSON.stringify(datos));
    upd.values.set('hora_actua', new Date().toISOString());
    upd.where = 'ide_whbse = $1';
    upd.addIntParam(1, ideWhbse);
    await this.dataSource.createQuery(upd);
  }

  async incrementarFallo(ideWhbse: number): Promise<number> {
    const res = await this.dataSource.pool.query(
      `UPDATE wha_bot_sesion SET intentos_fallo = intentos_fallo + 1
       WHERE ide_whbse = $1 RETURNING intentos_fallo`,
      [ideWhbse],
    );
    return res.rows[0]?.intentos_fallo ?? 0;
  }

  async cerrar(ideWhbse: number, estado: BotState = BotState.FINALIZADO): Promise<void> {
    const upd = new UpdateQuery('wha_bot_sesion', 'ide_whbse');
    upd.values.set('activa', false);
    upd.values.set('estado', estado);
    upd.values.set('hora_actua', new Date().toISOString());
    upd.where = 'ide_whbse = $1';
    upd.addIntParam(1, ideWhbse);
    await this.dataSource.createQuery(upd);
  }

  async expirarPorInactividad(ideWhbse: number): Promise<void> {
    await this.dataSource.pool.query(
      `UPDATE wha_bot_sesion SET activa = FALSE, estado = 'EXPIRADO', hora_actua = NOW()
       WHERE ide_whbse = $1`,
      [ideWhbse],
    );
  }

  /** Recupera datos del cliente y envío de sesiones completadas anteriores */
  async getMemoriaCliente(ideWhcha: number): Promise<{
    cliente?: import('./interfaces/bot-session.interface').ClienteSesion;
    provincia?: string;
  } | null> {
    // No se filtra por `estado`: que la cotización haya terminado en FINALIZADO,
    // CANCELADO o incluso EXPIRADO no dice nada sobre si el nombre/correo del cliente
    // capturado ahí es válido — si cliente.nombres quedó guardado es porque el cliente
    // ya se identificó, sin importar qué pasó después en esa sesión (ej. se derivó a
    // asesor a medio flujo, lo que ahora cierra la sesión como CANCELADO).
    const res = await this.dataSource.pool.query(
      `SELECT datos_sesion
       FROM wha_bot_sesion
       WHERE ide_whcha = $1
         AND activa = FALSE
         AND datos_sesion IS NOT NULL
         AND datos_sesion::jsonb -> 'cliente' ->> 'nombres' IS NOT NULL
       ORDER BY hora_actua DESC
       LIMIT 1`,
      [ideWhcha],
    );
    if (!res.rowCount) return null;
    const datos: import('./interfaces/bot-session.interface').DatosSesion =
      typeof res.rows[0].datos_sesion === 'string'
        ? JSON.parse(res.rows[0].datos_sesion)
        : res.rows[0].datos_sesion;
    if (!datos?.cliente?.nombres) return null;
    return {
      cliente: datos.cliente,
      provincia: datos.envio?.provincia,
    };
  }

  /** Obtiene historial de mensajes del chat para contexto de GPT */
  async getHistorialMensajes(ideWhcha: number, limit = 10): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const q = new SelectQuery(`
      SELECT body_whmem, direction_whmem
      FROM wha_mensaje
      WHERE ide_whcha = $1
        AND body_whmem IS NOT NULL
        AND content_type_whmem = 'text'
      ORDER BY ide_whmem DESC
      LIMIT ${limit}
    `);
    q.addParam(1, ideWhcha);
    const rows = await this.dataSource.createSelectQuery(q);
    return rows
      .reverse()
      .map((r) => ({
        role: r.direction_whmem === '0' ? ('user' as const) : ('assistant' as const),
        content: r.body_whmem as string,
      }));
  }

  /** Lista sesiones de bot de la empresa con datos del chat y cuenta */
  async getSessions(dto: BotSessionQueryDto & HeaderParamsDto) {
    const estadoCond = dto.estado ? `AND bs.estado = '${dto.estado}'` : '';

    const query = new SelectQuery(`
      SELECT
        bs.ide_whbse,
        bs.ide_whcha,
        bs.ide_whcue,
        cu.nombre_whcue,
        bs.estado,
        bs.activa,
        bs.intentos_fallo,
        bs.hora_ingre,
        bs.hora_actua,
        c.wa_id_whcha,
        c.name_whcha,
        c.nombre_whcha,
        c.phone_number_whcha,
        c.bot_modo_whcha
      FROM wha_bot_sesion bs
      INNER JOIN wha_chat c ON c.ide_whcha = bs.ide_whcha
      INNER JOIN wha_cuenta cu ON cu.ide_whcue = bs.ide_whcue
      WHERE cu.ide_empr = $1
        ${estadoCond}
      ORDER BY bs.hora_ingre DESC
    `, dto);
    query.addIntParam(1, dto.ideEmpr);
    return this.dataSource.createQuery(query, 'wha_bot_sesion');
  }

  /** Historial de sesiones de un chat específico */
  async getSessionHistory(ideWhcha: number, limit = 20) {
    const q = new SelectQuery(`
      SELECT
        ide_whbse,
        ide_whcha,
        ide_whcue,
        estado,
        activa,
        intentos_fallo,
        datos_sesion,
        hora_ingre,
        hora_actua
      FROM wha_bot_sesion
      WHERE ide_whcha = $1
      ORDER BY hora_ingre DESC
      LIMIT ${limit}
    `);
    q.addParam(1, ideWhcha);
    const rows = await this.dataSource.createSelectQuery(q);
    return rows.map((r) => ({
      ...r,
      datos_sesion: typeof r.datos_sesion === 'string'
        ? JSON.parse(r.datos_sesion)
        : r.datos_sesion,
    }));
  }
}
