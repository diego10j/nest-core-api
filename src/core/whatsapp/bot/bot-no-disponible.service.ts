import { Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';

import { NoDisponibleQueryDto } from './dto/no-disponible-query.dto';
import { SaveNoDisponibleDto } from './dto/save-no-disponible.dto';

export interface NoDisponibleMatch {
  ide_whbnd: number;
  nombre_whbnd: string;
  otros_nombres_whbnd: string | null;
  observacion_whbnd: string | null;
}

/**
 * Registro de productos que la empresa confirmó que NO comercializa (ver
 * scripts/core/bot_no_disponible_migration.sql). El bot lo consulta antes de derivar a
 * un asesor por un producto sin match en el catálogo — si ya está registrado acá,
 * responde directo sin esperar a un humano. Se alimenta desde el mantenimiento del
 * front (CRUD manual) y, a futuro, también podría alimentarse cuando un asesor
 * confirma "no disponemos" en el chat.
 */
@Injectable()
export class BotNoDisponibleService {
  private readonly logger = new Logger(BotNoDisponibleService.name);

  constructor(private readonly dataSource: DataSourceService) {}

  /**
   * Busca coincidencia por nombre (parcial, sin acentos/mayúsculas, en ambos sentidos —
   * igual criterio que BotToolsService.buscarProductos) contra productos ya confirmados
   * como no disponibles. Devuelve el primero que matchee o null.
   */
  async buscar(nombreProducto: string, ideEmpr: number): Promise<NoDisponibleMatch | null> {
    const q = new SelectQuery(`
      SELECT ide_whbnd, nombre_whbnd, otros_nombres_whbnd, observacion_whbnd
      FROM wha_bot_no_disponible
      WHERE ide_empr = $1
        AND activo_whbnd = TRUE
        AND (
          unaccent(UPPER(nombre_whbnd)) ILIKE '%' || unaccent(UPPER($2)) || '%'
          OR unaccent(UPPER($2)) ILIKE '%' || unaccent(UPPER(nombre_whbnd)) || '%'
          OR unaccent(UPPER(COALESCE(otros_nombres_whbnd, ''))) ILIKE '%' || unaccent(UPPER($2)) || '%'
          OR unaccent(UPPER($2)) ILIKE '%' || unaccent(UPPER(COALESCE(otros_nombres_whbnd, ''))) || '%'
        )
      ORDER BY LENGTH(nombre_whbnd) DESC
      LIMIT 1
    `);
    q.addIntParam(1, ideEmpr);
    q.addParam(2, nombreProducto);
    return this.dataSource.createSingleQuery(q);
  }

  /** Lista paginada para el mantenimiento del front */
  async getList(dto: NoDisponibleQueryDto & HeaderParamsDto) {
    const query = new SelectQuery(`
      SELECT
        ide_whbnd, nombre_whbnd, otros_nombres_whbnd, observacion_whbnd, activo_whbnd,
        ide_usua, usuario_ingre, hora_ingre, usuario_actua, hora_actua
      FROM wha_bot_no_disponible
      WHERE ide_empr = $1
      ORDER BY hora_ingre DESC
    `, dto);
    query.addIntParam(1, dto.ideEmpr);
    return this.dataSource.createQuery(query, 'wha_bot_no_disponible');
  }

  /** Crea o actualiza un registro (upsert por ide_whbnd) */
  async save(dto: SaveNoDisponibleDto & HeaderParamsDto): Promise<void> {
    if (dto.ide_whbnd) {
      const upd = new UpdateQuery('wha_bot_no_disponible', 'ide_whbnd');
      upd.values.set('nombre_whbnd', dto.nombre_whbnd);
      if (dto.otros_nombres_whbnd !== undefined) upd.values.set('otros_nombres_whbnd', dto.otros_nombres_whbnd);
      if (dto.observacion_whbnd !== undefined) upd.values.set('observacion_whbnd', dto.observacion_whbnd);
      if (dto.activo_whbnd !== undefined) upd.values.set('activo_whbnd', dto.activo_whbnd);
      upd.values.set('usuario_actua', dto.login);
      upd.where = 'ide_whbnd = $1 AND ide_empr = $2';
      upd.addIntParam(1, dto.ide_whbnd);
      upd.addIntParam(2, dto.ideEmpr);
      await this.dataSource.createQuery(upd);
    } else {
      const ins = new InsertQuery('wha_bot_no_disponible', 'ide_whbnd');
      ins.values.set('ide_empr', dto.ideEmpr);
      ins.values.set('nombre_whbnd', dto.nombre_whbnd);
      if (dto.otros_nombres_whbnd) ins.values.set('otros_nombres_whbnd', dto.otros_nombres_whbnd);
      if (dto.observacion_whbnd) ins.values.set('observacion_whbnd', dto.observacion_whbnd);
      ins.values.set('activo_whbnd', dto.activo_whbnd ?? true);
      ins.values.set('ide_usua', dto.ideUsua);
      ins.values.set('usuario_ingre', dto.login);
      await this.dataSource.createQuery(ins);
    }
    this.logger.log(`[NoDisponible] Guardado "${dto.nombre_whbnd}" ide_empr=${dto.ideEmpr}`);
  }

  async delete(dto: ArrayIdeDto & HeaderParamsDto) {
    const del = new DeleteQuery('wha_bot_no_disponible');
    del.where = 'ide_whbnd = ANY($1) AND ide_empr = $2';
    del.addParam(1, dto.ide);
    del.addIntParam(2, dto.ideEmpr);
    return this.dataSource.createQuery(del);
  }
}
