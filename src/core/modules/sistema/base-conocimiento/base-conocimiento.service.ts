import { createReadStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import { BadRequestException, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { Query } from 'src/core/connection/helpers/query';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { ErrorsLoggerService } from 'src/errors/errors-logger.service';
import { isDefined } from 'src/util/helpers/common-util';
import { normalizeString } from 'src/util/helpers/sql-util';

import { CONOCIMIENTO_STORAGE } from './constants/base-conocimiento.constants';
import { ArticuloUuidDto } from './dto/articulo-uuid.dto';
import { GetArchivosDto } from './dto/get-archivos.dto';
import { GetArticulosDto } from './dto/get-articulos.dto';
import { SaveArticuloDto } from './dto/save-articulo.dto';
import { getExtensionFile, isImageExtension } from './helpers/conocimiento-file.helper';

const stripHtml = (html: string): string =>
  (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

@Injectable()
export class BaseConocimientoService {
  private tableName = 'sis_conocimiento';
  private primaryKey = 'ide_cono';

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly errorLog: ErrorsLoggerService,
  ) {
    if (!existsSync(CONOCIMIENTO_STORAGE.BASE_PATH)) {
      mkdirSync(CONOCIMIENTO_STORAGE.BASE_PATH, { recursive: true });
    }
  }

  async getArticulos(dtoIn: GetArticulosDto & HeaderParamsDto): Promise<ResultQuery> {
    const { query, categoria, tag, tipoRelacion, ideReferencia, favorito } = dtoIn;
    const conditions: string[] = [`c.ide_empr = ${dtoIn.ideEmpr}`, `c.estado_cono = 'ACTIVO'`];
    const params: unknown[] = [];
    let pIdx = 1;

    if (query) {
      const sqlSearchValue = `%${normalizeString(query.trim())}%`;
      conditions.push(`(
        regexp_replace(unaccent(LOWER(c.titulo_cono)), '[^a-z0-9]', '', 'g') LIKE $${pIdx}
        OR regexp_replace(unaccent(LOWER(COALESCE(c.texto_plano_cono, ''))), '[^a-z0-9]', '', 'g') LIKE $${pIdx}
        OR EXISTS (
          SELECT 1 FROM sis_conocimiento_tag t
          WHERE t.ide_cono = c.ide_cono
            AND regexp_replace(unaccent(LOWER(t.tag)), '[^a-z0-9]', '', 'g') LIKE $${pIdx}
        )
        OR EXISTS (
          SELECT 1 FROM sis_conocimiento_relacion r
          WHERE r.ide_cono = c.ide_cono
            AND regexp_replace(unaccent(LOWER(r.nombre_referencia)), '[^a-z0-9]', '', 'g') LIKE $${pIdx}
        )
      )`);
      params.push(sqlSearchValue);
      pIdx++;
    }

    if (categoria) {
      conditions.push(`c.categoria_cono = $${pIdx}`);
      params.push(categoria);
      pIdx++;
    }

    if (tag) {
      conditions.push(`EXISTS (SELECT 1 FROM sis_conocimiento_tag t WHERE t.ide_cono = c.ide_cono AND t.tag = $${pIdx})`);
      params.push(tag);
      pIdx++;
    }

    if (tipoRelacion) {
      const relCondition = isDefined(ideReferencia)
        ? `EXISTS (SELECT 1 FROM sis_conocimiento_relacion r WHERE r.ide_cono = c.ide_cono AND r.tipo_relacion = $${pIdx} AND r.ide_referencia = $${pIdx + 1})`
        : `EXISTS (SELECT 1 FROM sis_conocimiento_relacion r WHERE r.ide_cono = c.ide_cono AND r.tipo_relacion = $${pIdx})`;
      conditions.push(relCondition);
      params.push(tipoRelacion);
      pIdx++;
      if (isDefined(ideReferencia)) {
        params.push(ideReferencia);
        pIdx++;
      }
    }

    if (favorito === 'true') {
      conditions.push(`c.favorito_cono = true`);
    }

    const query_ = new SelectQuery(`
      SELECT
        c.ide_cono,
        c.uuid,
        c.titulo_cono,
        c.contenido_cono,
        c.categoria_cono,
        c.favorito_cono,
        c.vistas_cono,
        c.usuario_ingre,
        c.fecha_reg_cono,
        c.fecha_actua_cono,
        COALESCE((
          SELECT array_agg(t.tag ORDER BY t.tag) FROM sis_conocimiento_tag t WHERE t.ide_cono = c.ide_cono
        ), '{}') AS tags,
        COALESCE((
          SELECT json_agg(json_build_object(
            'tipoRelacion', r.tipo_relacion,
            'ideReferencia', r.ide_referencia,
            'nombreReferencia', r.nombre_referencia,
            'subtipoReferencia', r.subtipo_referencia
          )) FROM sis_conocimiento_relacion r WHERE r.ide_cono = c.ide_cono
        ), '[]') AS relaciones,
        (SELECT COUNT(*) FROM sis_conocimiento_archivo a WHERE a.ide_cono = c.ide_cono) AS num_archivos
      FROM sis_conocimiento c
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.favorito_cono DESC, COALESCE(c.fecha_actua_cono, c.fecha_reg_cono) DESC
      LIMIT 200
      `);
    params.forEach((p, i) => query_.addParam(i + 1, p));
    const rows = await this.dataSource.createSelectQuery(query_);
    return { rowCount: rows.length, rows } as ResultQuery;
  }

  async getArticulo(dto: ArticuloUuidDto & HeaderParamsDto) {
    const query = new SelectQuery(`
      SELECT
        c.ide_cono,
        c.uuid,
        c.titulo_cono,
        c.contenido_cono,
        c.categoria_cono,
        c.favorito_cono,
        c.vistas_cono,
        c.usuario_ingre,
        c.fecha_reg_cono,
        c.fecha_actua_cono,
        COALESCE((
          SELECT array_agg(t.tag ORDER BY t.tag) FROM sis_conocimiento_tag t WHERE t.ide_cono = c.ide_cono
        ), '{}') AS tags,
        COALESCE((
          SELECT json_agg(json_build_object(
            'tipoRelacion', r.tipo_relacion,
            'ideReferencia', r.ide_referencia,
            'nombreReferencia', r.nombre_referencia,
            'subtipoReferencia', r.subtipo_referencia
          )) FROM sis_conocimiento_relacion r WHERE r.ide_cono = c.ide_cono
        ), '[]') AS relaciones
      FROM sis_conocimiento c
      WHERE c.uuid = $1 AND c.ide_empr = $2
    `);
    query.addStringParam(1, dto.uuid);
    query.addParam(2, dto.ideEmpr);
    const data = await this.dataSource.createSingleQuery(query);
    if (!data) {
      throw new BadRequestException('El artículo no existe');
    }
    return data;
  }

  async saveArticulo(dto: SaveArticuloDto & HeaderParamsDto): Promise<ResultQuery> {
    const { uuid, titulo, contenido, categoria, favorito, tags = [], relaciones = [] } = dto;
    const textoPlano = [titulo, stripHtml(contenido), tags.join(' ')].filter(Boolean).join(' ').slice(0, 20000);

    const listQuery: Query[] = [];
    let ideCono: number;

    if (uuid) {
      const existing = await this.dataSource.createSingleQuery(
        (() => {
          const q = new SelectQuery(`SELECT ide_cono FROM sis_conocimiento WHERE uuid = $1 AND ide_empr = $2`);
          q.addStringParam(1, uuid);
          q.addParam(2, dto.ideEmpr);
          return q;
        })(),
      );
      if (!existing) {
        throw new BadRequestException('El artículo no existe');
      }
      ideCono = existing.ide_cono;

      const updateQuery = new UpdateQuery(this.tableName, this.primaryKey, dto);
      updateQuery.values.set('titulo_cono', titulo);
      updateQuery.values.set('contenido_cono', contenido || null);
      updateQuery.values.set('texto_plano_cono', textoPlano);
      updateQuery.values.set('categoria_cono', categoria || null);
      if (isDefined(favorito)) updateQuery.values.set('favorito_cono', favorito);
      updateQuery.values.set('fecha_actua_cono', new Date());
      updateQuery.where = `ide_cono = ${ideCono}`;
      listQuery.push(updateQuery);
    } else {
      ideCono = await this.dataSource.getSeqTable(this.tableName, this.primaryKey, 1, dto.login);
      const insertQuery = new InsertQuery(this.tableName, this.primaryKey, dto);
      insertQuery.values.set(this.primaryKey, ideCono);
      insertQuery.values.set('titulo_cono', titulo);
      insertQuery.values.set('contenido_cono', contenido || null);
      insertQuery.values.set('texto_plano_cono', textoPlano);
      insertQuery.values.set('categoria_cono', categoria || null);
      insertQuery.values.set('favorito_cono', favorito ?? false);
      insertQuery.values.set('estado_cono', 'ACTIVO');
      insertQuery.values.set('vistas_cono', 0);
      listQuery.push(insertQuery);
    }

    // Reemplaza tags e relaciones (borra e inserta de nuevo, patrón simple de "reemplazar hijos")
    const deleteTags = new DeleteQuery('sis_conocimiento_tag');
    deleteTags.where = `ide_cono = ${ideCono}`;
    listQuery.push(deleteTags);

    const deleteRel = new DeleteQuery('sis_conocimiento_relacion');
    deleteRel.where = `ide_cono = ${ideCono}`;
    listQuery.push(deleteRel);

    if (tags.length > 0) {
      const seqTag = await this.dataSource.getSeqTable('sis_conocimiento_tag', 'ide_ctag', tags.length, dto.login);
      tags.forEach((tag, i) => {
        const insertTag = new InsertQuery('sis_conocimiento_tag', 'ide_ctag');
        insertTag.values.set('ide_ctag', seqTag + i);
        insertTag.values.set('ide_cono', ideCono);
        insertTag.values.set('tag', tag.toLowerCase().trim());
        listQuery.push(insertTag);
      });
    }

    if (relaciones.length > 0) {
      const seqRel = await this.dataSource.getSeqTable(
        'sis_conocimiento_relacion',
        'ide_crel',
        relaciones.length,
        dto.login,
      );
      relaciones.forEach((rel, i) => {
        const insertRel = new InsertQuery('sis_conocimiento_relacion', 'ide_crel');
        insertRel.values.set('ide_crel', seqRel + i);
        insertRel.values.set('ide_cono', ideCono);
        insertRel.values.set('tipo_relacion', rel.tipoRelacion);
        insertRel.values.set('ide_referencia', rel.ideReferencia);
        insertRel.values.set('nombre_referencia', rel.nombreReferencia);
        insertRel.values.set('subtipo_referencia', rel.subtipoReferencia || null);
        listQuery.push(insertRel);
      });
    }

    await this.dataSource.createListQuery(listQuery);

    const saved = await this.dataSource.createSingleQuery(
      (() => {
        const q = new SelectQuery(`SELECT uuid FROM sis_conocimiento WHERE ide_cono = $1`);
        q.addParam(1, ideCono);
        return q;
      })(),
    );

    return {
      message: uuid ? 'Artículo actualizado exitosamente' : 'Artículo creado exitosamente',
      row: { ideCono, uuid: saved.uuid },
    } as unknown as ResultQuery;
  }

  async deleteArticulo(dto: ArticuloUuidDto & HeaderParamsDto): Promise<ResultQuery> {
    const updateQuery = new UpdateQuery(this.tableName, this.primaryKey, dto);
    updateQuery.values.set('estado_cono', 'ARCHIVADO');
    updateQuery.where = `uuid = $1`;
    updateQuery.addParam(1, dto.uuid);
    await this.dataSource.createQuery(updateQuery);
    return { message: 'Artículo eliminado exitosamente' } as ResultQuery;
  }

  async registrarVista(dto: ArticuloUuidDto & HeaderParamsDto): Promise<ResultQuery> {
    const query = new SelectQuery(`UPDATE sis_conocimiento SET vistas_cono = vistas_cono + 1 WHERE uuid = $1`);
    query.addStringParam(1, dto.uuid);
    await this.dataSource.createSelectQuery(query);
    return { message: 'ok' } as ResultQuery;
  }

  async getCategorias(dto: HeaderParamsDto) {
    const query = new SelectQuery(`
      SELECT DISTINCT categoria_cono AS categoria
      FROM sis_conocimiento
      WHERE ide_empr = $1 AND estado_cono = 'ACTIVO' AND categoria_cono IS NOT NULL
      ORDER BY categoria_cono
    `);
    query.addParam(1, dto.ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  async getTags(dto: HeaderParamsDto & { value?: string }) {
    const query = new SelectQuery(`
      SELECT DISTINCT t.tag
      FROM sis_conocimiento_tag t
      INNER JOIN sis_conocimiento c ON c.ide_cono = t.ide_cono
      WHERE c.ide_empr = $1 AND c.estado_cono = 'ACTIVO'
      ${dto.value ? `AND t.tag LIKE $2` : ''}
      ORDER BY t.tag
      LIMIT 50
    `);
    query.addParam(1, dto.ideEmpr);
    if (dto.value) query.addStringParam(2, `%${dto.value.toLowerCase()}%`);
    return this.dataSource.createSelectQuery(query);
  }

  // ------------------------------------------------------- Adjuntos (propios, sin sis_archivo)

  async uploadArchivo(ideCono: number, file: Express.Multer.File, dto: HeaderParamsDto): Promise<ResultQuery> {
    const extension = getExtensionFile(file.filename);
    const ideCarc = await this.dataSource.getSeqTable('sis_conocimiento_archivo', 'ide_carc', 1, dto.login);
    const insertQuery = new InsertQuery('sis_conocimiento_archivo', 'ide_carc', dto);
    insertQuery.values.set('ide_carc', ideCarc);
    insertQuery.values.set('ide_cono', ideCono);
    insertQuery.values.set('nombre_original_carc', file.originalname);
    insertQuery.values.set('nombre_disco_carc', file.filename);
    insertQuery.values.set('mime_carc', file.mimetype);
    insertQuery.values.set('extension_carc', extension);
    insertQuery.values.set('peso_carc', file.size);
    await this.dataSource.createQuery(insertQuery);
    return { message: 'Adjunto subido exitosamente' } as ResultQuery;
  }

  async getArchivos(dto: GetArchivosDto & HeaderParamsDto) {
    const query = new SelectQuery(`
      SELECT
        a.ide_carc,
        a.uuid,
        a.nombre_original_carc AS nombre,
        a.mime_carc,
        a.extension_carc,
        a.peso_carc AS peso,
        a.usuario_ingre,
        a.fecha_reg_carc
      FROM sis_conocimiento_archivo a
      WHERE a.ide_cono = $1
      ORDER BY a.fecha_reg_carc DESC
    `);
    query.addParam(1, dto.ideCono);
    const data = await this.dataSource.createSelectQuery(query);
    data.forEach((row) => {
      row.esImagen = isImageExtension(row.extension_carc || '');
    });
    return data;
  }

  async downloadArchivo(uuid: string, res: Response) {
    const query = new SelectQuery(`
      SELECT nombre_disco_carc, nombre_original_carc, mime_carc
      FROM sis_conocimiento_archivo
      WHERE uuid = $1
    `);
    query.addStringParam(1, uuid);
    const data = await this.dataSource.createSingleQuery(query);
    if (!data) {
      throw new BadRequestException('El adjunto no existe');
    }
    const filePath = join(CONOCIMIENTO_STORAGE.BASE_PATH, data.nombre_disco_carc);
    if (!existsSync(filePath)) {
      throw new BadRequestException('El archivo no existe en disco');
    }
    const stat = statSync(filePath);
    res.setHeader('Content-Type', data.mime_carc || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${data.nombre_original_carc}"`);
    createReadStream(filePath).pipe(res);
  }

  async deleteArchivo(dto: ArticuloUuidDto & HeaderParamsDto): Promise<ResultQuery> {
    const query = new SelectQuery(`SELECT nombre_disco_carc FROM sis_conocimiento_archivo WHERE uuid = $1`);
    query.addStringParam(1, dto.uuid);
    const data = await this.dataSource.createSingleQuery(query);
    if (!data) {
      throw new BadRequestException('El adjunto no existe');
    }
    const deleteQuery = new DeleteQuery('sis_conocimiento_archivo');
    deleteQuery.where = `uuid = $1`;
    deleteQuery.addParam(1, dto.uuid);
    await this.dataSource.createQuery(deleteQuery);

    const filePath = join(CONOCIMIENTO_STORAGE.BASE_PATH, data.nombre_disco_carc);
    try {
      unlinkSync(filePath);
    } catch (error) {
      this.errorLog.createErrorLog(`No se pudo borrar el adjunto ${filePath}: ${error}`);
    }
    return { message: 'Adjunto eliminado exitosamente' } as ResultQuery;
  }
}
