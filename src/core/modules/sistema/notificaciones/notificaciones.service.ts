import { Injectable, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { AsignarUsuarioDto } from './dto/asignar-usuario.dto';
import { CreateNotificacionDto } from './dto/create-notificacion.dto';
import { GetMisNotificacionesDto } from './dto/get-mis-notificaciones.dto';
import { GetPlantillasDto } from './dto/get-plantillas.dto';
import { UpdateNotificacionDto } from './dto/update-notificacion.dto';
import { NotificacionesGateway } from './notificaciones.gateway';

@Injectable()
export class NotificacionesService {
  private tableNotif = 'sis_notificacion';
  private tableNotifUsua = 'sis_notificacion_usuario';
  private tableMensaje = 'sis_mensaje_noti';

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly gateway: NotificacionesGateway,
  ) {}

  // ========== PLANTILLAS ==========

  async getPlantillas(dtoIn: GetPlantillasDto & HeaderParamsDto) {
    const condActivo =
      dtoIn.activoNoti != null ? 'AND n.activo_noti = $3' : '';

    const query = new SelectQuery(
      `
      SELECT
        n.ide_noti,
        n.uuid,
        n.nombre_noti,
        n.descripcion_noti,
        n.codigo_noti,
        n.icono_noti,
        n.color_noti,
        n.modulo_noti,
        n.activo_noti,
        n.botones_noti,
        n.notificar_todos_noti,
        n.fecha_reg_noti,
        (
          SELECT COUNT(*) FROM sis_notificacion_usuario nu
          WHERE nu.ide_noti = n.ide_noti AND nu.activo_nouu = TRUE
        )::int AS total_usuarios
      FROM sis_notificacion n
      WHERE n.ide_empr = $1
        AND n.activo_noti = $2
        ${condActivo}
      ORDER BY n.fecha_reg_noti DESC
    `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ideEmpr);
    query.addBooleanParam(2, true);

    if (dtoIn.activoNoti != null) {
      query.addBooleanParam(3, dtoIn.activoNoti);
    }

    return this.dataSource.createQuery(query, this.tableNotif);
  }

  async getPlantillaByUuid(uuid: string, ideEmpr: number) {
    const query = new SelectQuery(
      `
      SELECT
        n.ide_noti,
        n.uuid,
        n.nombre_noti,
        n.descripcion_noti,
        n.codigo_noti,
        n.icono_noti,
        n.color_noti,
        n.modulo_noti,
        n.activo_noti,
        n.botones_noti,
        n.notificar_todos_noti
      FROM sis_notificacion n
      WHERE n.uuid = $1 AND n.ide_empr = $2
    `,
    );

    query.addStringParam(1, uuid);
    query.addIntParam(2, ideEmpr);

    const result = await this.dataSource.createSingleQuery(query);
    if (!result) throw new NotFoundException('Plantilla no encontrada');
    return result;
  }

  async getPlantillaUsuarios(uuid: string, ideEmpr: number) {
    const query = new SelectQuery(
      `
      SELECT
        nu.ide_nouu,
        nu.ide_noti,
        nu.ide_usua,
        nu.activo_nouu,
        u.nick_usua AS login,
        u.nom_usua AS nombre
      FROM sis_notificacion_usuario nu
      INNER JOIN sis_notificacion n ON n.ide_noti = nu.ide_noti
      INNER JOIN sis_usuario u ON u.ide_usua = nu.ide_usua
      WHERE n.uuid = $1 AND n.ide_empr = $2
        AND nu.activo_nouu = TRUE
      ORDER BY u.nom_usua
    `,
    );

    query.addStringParam(1, uuid);
    query.addIntParam(2, ideEmpr);

    return this.dataSource.createSelectQuery(query);
  }

  async createPlantilla(dtoIn: CreateNotificacionDto & HeaderParamsDto) {
    const ideNoti = await this.dataSource.getSeqTable(
      this.tableNotif,
      'ide_noti',
      1,
      dtoIn.login,
    );

    await this.dataSource.pool.query(
      `INSERT INTO sis_notificacion (
        ide_noti, nombre_noti, descripcion_noti, codigo_noti,
        icono_noti, color_noti, modulo_noti, activo_noti,
        botones_noti, notificar_todos_noti, ide_empr, usuario_ingre
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        ideNoti,
        dtoIn.nombreNoti,
        dtoIn.descripcionNoti ?? null,
        dtoIn.codigoNoti,
        dtoIn.iconoNoti ?? '🔔',
        dtoIn.colorNoti ?? '#1890ff',
        dtoIn.moduloNoti ?? null,
        dtoIn.activoNoti ?? true,
        JSON.stringify(dtoIn.botonesNoti ?? []),
        dtoIn.notificarTodosNoti ?? false,
        dtoIn.ideEmpr,
        dtoIn.login,
      ],
    );

    if (dtoIn.ideUsuaList && dtoIn.ideUsuaList.length > 0) {
      await this._batchAssignUsuarios(ideNoti, dtoIn.ideUsuaList, dtoIn.login);
    }

    const uuid = await this._getUuidById(ideNoti);
    return { message: 'ok', ideNoti, uuid };
  }

  async updatePlantilla(dtoIn: UpdateNotificacionDto & HeaderParamsDto) {
    await this.getPlantillaByUuid(
      dtoIn.uuid,
      dtoIn.ideEmpr,
    );

    const sets: string[] = ['usuario_actua = $2', 'fecha_actua_noti = NOW()'];
    const params: Array<unknown> = [dtoIn.uuid, dtoIn.login];
    let idx = 3;

    if (dtoIn.nombreNoti !== undefined) {
      sets.push(`nombre_noti = $${idx++}`);
      params.push(dtoIn.nombreNoti);
    }
    if (dtoIn.descripcionNoti !== undefined) {
      sets.push(`descripcion_noti = $${idx++}`);
      params.push(dtoIn.descripcionNoti);
    }
    if (dtoIn.codigoNoti !== undefined) {
      sets.push(`codigo_noti = $${idx++}`);
      params.push(dtoIn.codigoNoti);
    }
    if (dtoIn.iconoNoti !== undefined) {
      sets.push(`icono_noti = $${idx++}`);
      params.push(dtoIn.iconoNoti);
    }
    if (dtoIn.colorNoti !== undefined) {
      sets.push(`color_noti = $${idx++}`);
      params.push(dtoIn.colorNoti);
    }
    if (dtoIn.moduloNoti !== undefined) {
      sets.push(`modulo_noti = $${idx++}`);
      params.push(dtoIn.moduloNoti);
    }
    if (dtoIn.activoNoti !== undefined) {
      sets.push(`activo_noti = $${idx++}`);
      params.push(dtoIn.activoNoti);
    }
    if (dtoIn.botonesNoti !== undefined) {
      sets.push(`botones_noti = $${idx++}`);
      params.push(JSON.stringify(dtoIn.botonesNoti));
    }
    if (dtoIn.notificarTodosNoti !== undefined) {
      sets.push(`notificar_todos_noti = $${idx++}`);
      params.push(dtoIn.notificarTodosNoti);
    }

    await this.dataSource.pool.query(
      `UPDATE sis_notificacion SET ${sets.join(', ')} WHERE uuid = $1 AND ide_empr = $${idx}`,
      [...params, dtoIn.ideEmpr],
    );

    return { message: 'ok', uuid: dtoIn.uuid };
  }

  async deletePlantilla(uuid: string, h: HeaderParamsDto) {
    await this.dataSource.pool.query(
      `UPDATE sis_notificacion SET activo_noti = FALSE, usuario_actua = $1, fecha_actua_noti = NOW() WHERE uuid = $2 AND ide_empr = $3`,
      [h.login, uuid, h.ideEmpr],
    );
    return { message: 'ok' };
  }

  async asignarUsuario(
    uuid: string,
    dtoIn: AsignarUsuarioDto & HeaderParamsDto,
  ) {
    const plantilla = await this.getPlantillaByUuid(
      uuid,
      dtoIn.ideEmpr,
    );

    await this.dataSource.pool.query(
      `INSERT INTO sis_notificacion_usuario (ide_noti, ide_usua, usuario_ingre)
       VALUES ($1,$2,$3)
       ON CONFLICT (ide_noti, ide_usua) DO UPDATE SET activo_nouu = TRUE, usuario_ingre = $3`,
      [plantilla.ide_noti, dtoIn.ideUsua, dtoIn.login],
    );

    return { message: 'ok' };
  }

  async quitarUsuario(
    uuid: string,
    ideUsuaRm: number,
    h: HeaderParamsDto,
  ) {
    const plantilla = await this.getPlantillaByUuid(uuid, h.ideEmpr);

    await this.dataSource.pool.query(
      `UPDATE sis_notificacion_usuario SET activo_nouu = FALSE, usuario_ingre = $1 WHERE ide_noti = $2 AND ide_usua = $3`,
      [h.login, plantilla.ide_noti, ideUsuaRm],
    );

    return { message: 'ok' };
  }

  // ========== NOTIFICACIONES DEL USUARIO (MIAS) ==========

  async getMisNotificaciones(
    dtoIn: GetMisNotificacionesDto & HeaderParamsDto,
  ) {
    const tab = dtoIn.tab || 'all';

    let condTab = '';
    if (tab === 'unread') {
      condTab = 'AND m.leido_meno = FALSE AND m.archivado_meno = FALSE';
    } else if (tab === 'archived') {
      condTab = 'AND m.archivado_meno = TRUE';
    }

    const query = new SelectQuery(
      `
      SELECT
        m.uuid,
        m.ide_noti,
        m.ide_usua_destino,
        m.ide_usua_origen,
        m.titulo_meno,
        m.mensaje_meno,
        m.contenido_meno,
        m.botones_meno,
        m.leido_meno,
        m.archivado_meno,
        m.fecha_envio_meno,
        m.fecha_leido_meno,
        n.codigo_noti,
        n.icono_noti,
        n.color_noti,
        n.modulo_noti,
        n.nombre_noti
      FROM sis_mensaje_noti m
      LEFT JOIN sis_notificacion n ON n.ide_noti = m.ide_noti
      WHERE m.ide_usua_destino = $1
        AND m.ide_empr = $2
        AND m.activo_meno = TRUE
        ${condTab}
      ORDER BY m.fecha_envio_meno DESC
    `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ideUsua);
    query.addIntParam(2, dtoIn.ideEmpr);

    return this.dataSource.createQuery(query, this.tableMensaje);
  }

  async getConteos(h: HeaderParamsDto) {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE leido_meno = FALSE AND archivado_meno = FALSE AND activo_meno = TRUE)::int AS "noLeidas",
        COUNT(*) FILTER (WHERE leido_meno = TRUE AND archivado_meno = FALSE AND activo_meno = TRUE)::int AS "leidas",
        COUNT(*) FILTER (WHERE archivado_meno = TRUE AND activo_meno = TRUE)::int AS "archivadas",
        COUNT(*) FILTER (WHERE activo_meno = TRUE)::int AS "total"
      FROM sis_mensaje_noti
      WHERE ide_usua_destino = $1 AND ide_empr = $2
    `;

    const result = await this.dataSource.pool.query(query, [
      h.ideUsua,
      h.ideEmpr,
    ]);

    return result.rows[0] || { noLeidas: 0, leidas: 0, archivadas: 0, total: 0 };
  }

  async marcarLeido(uuid: string, h: HeaderParamsDto) {
    const result = await this.dataSource.pool.query(
      `UPDATE sis_mensaje_noti
       SET leido_meno = TRUE, fecha_leido_meno = NOW()
       WHERE uuid = $1 AND ide_usua_destino = $2 AND ide_empr = $3
       RETURNING ide_usua_destino`,
      [uuid, h.ideUsua, h.ideEmpr],
    );

    if (result.rowCount === 0) throw new NotFoundException('Notificación no encontrada');

    await this._emitirBadge(h.ideUsua, h.ideEmpr);
    return { message: 'ok' };
  }

  async marcarTodasLeidas(h: HeaderParamsDto) {
    await this.dataSource.pool.query(
      `UPDATE sis_mensaje_noti
       SET leido_meno = TRUE, fecha_leido_meno = NOW()
       WHERE ide_usua_destino = $1 AND ide_empr = $2
         AND leido_meno = FALSE AND activo_meno = TRUE`,
      [h.ideUsua, h.ideEmpr],
    );

    await this._emitirBadge(h.ideUsua, h.ideEmpr);
    return { message: 'ok' };
  }

  async archivar(uuid: string, h: HeaderParamsDto) {
    const result = await this.dataSource.pool.query(
      `UPDATE sis_mensaje_noti
       SET archivado_meno = TRUE
       WHERE uuid = $1 AND ide_usua_destino = $2 AND ide_empr = $3
       RETURNING ide_usua_destino`,
      [uuid, h.ideUsua, h.ideEmpr],
    );

    if (result.rowCount === 0) throw new NotFoundException('Notificación no encontrada');

    await this._emitirBadge(h.ideUsua, h.ideEmpr);
    return { message: 'ok' };
  }

  async deleteNotificacion(uuid: string, h: HeaderParamsDto) {
    const result = await this.dataSource.pool.query(
      `UPDATE sis_mensaje_noti
       SET activo_meno = FALSE
       WHERE uuid = $1 AND ide_usua_destino = $2 AND ide_empr = $3
       RETURNING ide_usua_destino`,
      [uuid, h.ideUsua, h.ideEmpr],
    );

    if (result.rowCount === 0) throw new NotFoundException('Notificación no encontrada');

    await this._emitirBadge(h.ideUsua, h.ideEmpr);
    return { message: 'ok' };
  }

  // ========== MÉTODOS PÚBLICOS enviar() ==========

  /**
   * Enviar notificación desde un módulo del ERP (usuario autenticado).
   * @param dto HeaderParamsDto con ideUsua, ideEmpr, login, etc.
   */
  async enviar(
    codigo: string,
    titulo: string,
    mensaje: string,
    datos: Record<string, unknown> | null,
    dto: HeaderParamsDto,
  ): Promise<void> {
    return this._enviarCore(codigo, titulo, mensaje, datos, {
      ideEmpr: dto.ideEmpr,
      ideUsuaOrigen: dto.ideUsua || null,
      login: dto.login,
    });
  }

  /**
   * Enviar notificación desde un proceso automático (bot, webhook, cron).
   * No requiere headers de usuario — solo ide_empr.
   */
  async enviarSistema(
    codigo: string,
    titulo: string,
    mensaje: string,
    datos: Record<string, unknown> | null,
    ideEmpr: number,
    login: string = 'sistema',
  ): Promise<void> {
    return this._enviarCore(codigo, titulo, mensaje, datos, {
      ideEmpr,
      ideUsuaOrigen: null,
      login,
    });
  }

  // ========== MÉTODOS PRIVADOS ==========

  private async _enviarCore(
    codigo: string,
    titulo: string,
    mensaje: string,
    datos: Record<string, unknown> | null,
    ctx: { ideEmpr: number; ideUsuaOrigen: number | null; login: string },
  ) {
    const plantilla = await this.dataSource.pool.query(
      `SELECT ide_noti, icono_noti, color_noti, modulo_noti, nombre_noti, botones_noti, codigo_noti, notificar_todos_noti
       FROM sis_notificacion
       WHERE codigo_noti = $1 AND ide_empr = $2 AND activo_noti = TRUE
       LIMIT 1`,
      [codigo, ctx.ideEmpr],
    );

    if (plantilla.rowCount === 0) return;

    const p = plantilla.rows[0];

    let usuarios;

    if (p.notificar_todos_noti) {
      usuarios = await this.dataSource.pool.query(
        `SELECT ide_usua
         FROM sis_usuario
         WHERE activo_usua = TRUE AND ide_empr = $1
         ORDER BY ide_usua`,
        [ctx.ideEmpr],
      );
    } else {
      usuarios = await this.dataSource.pool.query(
        `SELECT nu.ide_usua
         FROM sis_notificacion_usuario nu
         WHERE nu.ide_noti = $1 AND nu.activo_nouu = TRUE`,
        [p.ide_noti],
      );
    }

    if (usuarios.rowCount === 0) return;

    const botonesMeno = datos?.botones ?? p.botones_noti ?? [];
    const contenidoMeno = datos ? { ...datos } : {};
    if (contenidoMeno.botones) delete contenidoMeno.botones;

    for (const row of usuarios.rows) {
      const result = await this.dataSource.pool.query(
        `INSERT INTO sis_mensaje_noti (
          ide_noti, ide_usua_destino, ide_usua_origen,
          titulo_meno, mensaje_meno, contenido_meno, botones_meno,
          ide_empr, usuario_ingre
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING uuid, fecha_envio_meno`,
        [
          p.ide_noti,
          row.ide_usua,
          ctx.ideUsuaOrigen,
          titulo,
          mensaje,
          JSON.stringify(contenidoMeno),
          JSON.stringify(botonesMeno),
          ctx.ideEmpr,
          ctx.login,
        ],
      );

      const msg = result.rows[0];

      await this._emitirBadge(row.ide_usua, ctx.ideEmpr);

      this.gateway.emitirAUsuario(row.ide_usua, {
        uuid: msg.uuid,
        ideNoti: p.ide_noti,
        codigoNoti: p.codigo_noti,
        iconoNoti: p.icono_noti ?? '🔔',
        colorNoti: p.color_noti ?? '#1890ff',
        tituloMeno: titulo,
        mensajeMeno: mensaje,
        contenidoMeno: contenidoMeno as Record<string, unknown>,
        botonesMeno: botonesMeno as Array<Record<string, unknown>>,
        moduloNoti: p.modulo_noti ?? '',
        fechaEnvioMeno: msg.fecha_envio_meno,
      });
    }
  }

  private async _batchAssignUsuarios(
    ideNoti: number,
    ideUsuaList: number[],
    login: string,
  ) {
    const valores: string[] = [];
    const params: Array<unknown> = [];
    let idx = 1;

    for (const ideUsua of ideUsuaList) {
      valores.push(`($${idx++}, $${idx++}, $${idx++})`);
      params.push(ideNoti, ideUsua, login);
    }

    await this.dataSource.pool.query(
      `INSERT INTO sis_notificacion_usuario (ide_noti, ide_usua, usuario_ingre)
       VALUES ${valores.join(', ')}`,
      params,
    );
  }

  private async _getUuidById(ideNoti: number): Promise<string> {
    const result = await this.dataSource.pool.query(
      `SELECT uuid FROM sis_notificacion WHERE ide_noti = $1`,
      [ideNoti],
    );
    return result.rows[0]?.uuid ?? '';
  }

  private async _emitirBadge(ideUsua: number, ideEmpr: number) {
    const counts = await this.dataSource.pool.query(
      `SELECT COUNT(*)::int AS "totalNoLeidas"
       FROM sis_mensaje_noti
       WHERE ide_usua_destino = $1 AND ide_empr = $2
         AND leido_meno = FALSE AND archivado_meno = FALSE AND activo_meno = TRUE`,
      [ideUsua, ideEmpr],
    );

    const totalNoLeidas = counts.rows[0]?.totalNoLeidas ?? 0;
    this.gateway.emitirBadge(ideUsua, { totalNoLeidas });
  }
}
