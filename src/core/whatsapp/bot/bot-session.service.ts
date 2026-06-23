import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { BotState } from './interfaces/bot-state.enum';
import { DatosSesion } from './interfaces/bot-session.interface';

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

  async getOrCreate(ideWhcha: number, ideWhcue: number): Promise<BotSesion> {
    const existing = await this.getActiva(ideWhcha);
    if (existing) return existing;

    const ins = new InsertQuery('wha_bot_sesion', 'ide_whbse');
    ins.values.set('ide_whcha', ideWhcha);
    ins.values.set('ide_whcue', ideWhcue);
    ins.values.set('estado', BotState.INICIO);
    ins.values.set('datos_sesion', JSON.stringify({ productos: [] }));
    ins.values.set('activa', true);
    ins.values.set('intentos_fallo', 0);
    await this.dataSource.createQuery(ins);

    return this.getActiva(ideWhcha);
  }

  async getActiva(ideWhcha: number): Promise<BotSesion | null> {
    const q = new SelectQuery(`
      SELECT ide_whbse, ide_whcha, ide_whcue, estado,
             datos_sesion, activa, intentos_fallo
      FROM wha_bot_sesion
      WHERE ide_whcha = $1 AND activa = TRUE
      ORDER BY ide_whbse DESC
      LIMIT 1
    `);
    q.addParam(1, ideWhcha);
    const row = await this.dataSource.createSingleQuery(q);
    if (!row) return null;
    return {
      ...row,
      datos_sesion: typeof row.datos_sesion === 'string'
        ? JSON.parse(row.datos_sesion)
        : (row.datos_sesion as DatosSesion),
    } as BotSesion;
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
}
