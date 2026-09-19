import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { FileTempService } from '../../modules/sistema/files/file-temp.service';
import { getFileExtension } from '../helpers/media-util';

import { SaveMensajeRapidoDto } from './dto/save-mensaje-rapido.dto';

/**
 * Mensajes rápidos de WhatsApp (ver scripts/core/mensaje_rapido_migration.sql): plantillas
 * internas con texto con formato, adjuntos y/o ubicación que los agentes reenvían desde el chat.
 */
@Injectable()
export class MensajeRapidoService {
  private readonly logger = new Logger(MensajeRapidoService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly fileTempService: FileTempService,
  ) {}

  /** Lista de la empresa. `soloActivos` para el selector del chat; el mantenimiento ve todos. */
  async getList(dto: HeaderParamsDto & { soloActivos?: boolean }) {
    const query = new SelectQuery(
      `
      SELECT
        ide_whmer,
        titulo_whmer,
        mensaje_whmer,
        adjuntos_whmer,
        latitud_whmer::float8  AS latitud_whmer,
        longitud_whmer::float8 AS longitud_whmer,
        ubicacion_nombre_whmer,
        ubicacion_direccion_whmer,
        activo_whmer,
        usuario_ingre,
        hora_ingre,
        usuario_actua,
        hora_actua
      FROM wha_mensaje_rapido
      WHERE ide_empr = $1
        AND ($2::bool IS NOT TRUE OR activo_whmer = TRUE)
      ORDER BY activo_whmer DESC, titulo_whmer
      `,
    );
    query.addIntParam(1, dto.ideEmpr);
    query.addParam(2, dto.soloActivos === true);
    return this.dataSource.createSelectQuery(query);
  }

  /** Crea o actualiza (upsert por ide_whmer) */
  async save(dto: SaveMensajeRapidoDto & HeaderParamsDto) {
    const mensaje = dto.mensaje_whmer?.trim() || null;
    const adjuntos = dto.adjuntos_whmer ?? [];
    const tieneUbicacion =
      dto.latitud_whmer !== null && dto.latitud_whmer !== undefined &&
      dto.longitud_whmer !== null && dto.longitud_whmer !== undefined;

    if ((dto.latitud_whmer == null) !== (dto.longitud_whmer == null)) {
      throw new BadRequestException('La ubicación requiere latitud y longitud');
    }
    if (!mensaje && adjuntos.length === 0 && !tieneUbicacion) {
      throw new BadRequestException('El mensaje debe tener texto, adjuntos o una ubicación');
    }

    const adjuntosJson = JSON.stringify(adjuntos);

    if (dto.ide_whmer) {
      const upd = new UpdateQuery('wha_mensaje_rapido', 'ide_whmer');
      upd.values.set('titulo_whmer', dto.titulo_whmer.trim());
      upd.values.set('mensaje_whmer', mensaje);
      upd.values.set('adjuntos_whmer', adjuntosJson);
      upd.values.set('latitud_whmer', dto.latitud_whmer ?? null);
      upd.values.set('longitud_whmer', dto.longitud_whmer ?? null);
      upd.values.set('ubicacion_nombre_whmer', tieneUbicacion ? dto.ubicacion_nombre_whmer || null : null);
      upd.values.set('ubicacion_direccion_whmer', tieneUbicacion ? dto.ubicacion_direccion_whmer || null : null);
      if (dto.activo_whmer !== undefined) upd.values.set('activo_whmer', dto.activo_whmer);
      upd.values.set('usuario_actua', dto.login); // hora_actua la asigna DataSourceService
      upd.where = 'ide_whmer = $1 AND ide_empr = $2';
      upd.addIntParam(1, dto.ide_whmer);
      upd.addIntParam(2, dto.ideEmpr);
      await this.dataSource.createQuery(upd);
    } else {
      const ins = new InsertQuery('wha_mensaje_rapido', 'ide_whmer');
      ins.values.set('ide_empr', dto.ideEmpr);
      ins.values.set('titulo_whmer', dto.titulo_whmer.trim());
      ins.values.set('mensaje_whmer', mensaje);
      ins.values.set('adjuntos_whmer', adjuntosJson);
      if (tieneUbicacion) {
        ins.values.set('latitud_whmer', dto.latitud_whmer);
        ins.values.set('longitud_whmer', dto.longitud_whmer);
        if (dto.ubicacion_nombre_whmer) ins.values.set('ubicacion_nombre_whmer', dto.ubicacion_nombre_whmer);
        if (dto.ubicacion_direccion_whmer) ins.values.set('ubicacion_direccion_whmer', dto.ubicacion_direccion_whmer);
      }
      ins.values.set('activo_whmer', dto.activo_whmer ?? true);
      ins.values.set('ide_usua', dto.ideUsua);
      ins.values.set('usuario_ingre', dto.login);
      await this.dataSource.createQuery(ins);
    }
    this.logger.log(`[MensajeRapido] Guardado "${dto.titulo_whmer}" ide_empr=${dto.ideEmpr}`);
    return { ok: true };
  }

  async delete(dto: ArrayIdeDto & HeaderParamsDto) {
    const del = new DeleteQuery('wha_mensaje_rapido');
    del.where = 'ide_whmer = ANY($1) AND ide_empr = $2';
    del.addParam(1, dto.ide);
    del.addIntParam(2, dto.ideEmpr);
    return this.dataSource.createQuery(del);
  }

  /**
   * Guarda un adjunto en el servidor (carpeta de media de WhatsApp) y devuelve su URL permanente,
   * para referenciarla en `adjuntos_whmer`.
   */
  async saveAdjunto(file: Express.Multer.File) {
    const savedName = await this.fileTempService.saveWhatsAppMedia(
      file.buffer,
      getFileExtension(file.mimetype, file.originalname),
    );
    const tipo = file.mimetype.startsWith('image/')
      ? 'image'
      : file.mimetype.startsWith('video/')
        ? 'video'
        : 'document';
    return {
      url: `${envs.hostApi}/api/whatsapp/media/${savedName}`,
      nombre: file.originalname,
      tipo,
      mime: file.mimetype,
    };
  }
}
