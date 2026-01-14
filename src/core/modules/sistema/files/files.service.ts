import { createReadStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import { Injectable, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, SelectQuery, InsertQuery, UpdateQuery } from 'src/core/connection/helpers';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { ErrorsLoggerService } from 'src/errors/errors-logger.service';
import { HOST_API, isDefined } from 'src/util/helpers/common-util';
import { toDate, FORMAT_DATETIME_DB, getCurrentDateTime } from 'src/util/helpers/date-util';
import { getStaticImage } from 'src/util/helpers/file-utils';

import { CheckExistFileDto } from './dto/check-exist-file.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { DeleteFilesDto } from './dto/delete-files.dto';
import { FavoriteFileDto } from './dto/favorite-file.dto';
import { GetFilesDto } from './dto/get-files.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FILE_STORAGE_CONSTANTS } from './file-temp.service';
import { getExtensionFile, getFileType, getUuidNameFile } from './helpers/fileNamer.helper';

@Injectable()
export class FilesService {
  private tableName = 'sis_archivo';
  private primaryKey = 'ide_arch';

  constructor(
    private readonly errorLog: ErrorsLoggerService,
    private readonly dataSource: DataSourceService,
  ) {
    if (!existsSync(FILE_STORAGE_CONSTANTS.BASE_PATH)) {
      mkdirSync(FILE_STORAGE_CONSTANTS.BASE_PATH, { recursive: true });
    }
  }

  /**
   * Crea una carpeta en un directorio especifico
   * @param dto
   * @returns
   */
  async createFolder(dto: CreateFolderDto & HeaderParamsDto): Promise<ResultQuery> {
    const { folderName, sis_ide_arch, ide_inarti } = dto;
    // if (await this._checkExistFile(folderName, sis_ide_arch)) {
    //     throw new BadRequestException(`La carpeta ${folderName} ya existe`);
    // }
    // inserta
    const insertQuery = new InsertQuery(this.tableName, this.primaryKey, dto);
    insertQuery.values.set('nombre_arch', folderName);
    insertQuery.values.set('carpeta_arch', true);
    insertQuery.values.set('sis_ide_arch', sis_ide_arch || null);
    insertQuery.values.set('ide_inarti', ide_inarti || null);
    insertQuery.values.set('public_arch', true);
    insertQuery.values.set('favorita_arch', false);
    insertQuery.values.set('descargas_arch', 0);
    insertQuery.values.set(
      this.primaryKey,
      await this.dataSource.getSeqTable(this.tableName, this.primaryKey, 1, dto.login),
    );
    const res = await this.dataSource.createQuery(insertQuery);
    res.message = `Carpeta ${folderName} creada exitosamente`;
    return res;
  }

  /**
   * Retorna todos los archivos de un directorio especifico
   * @param dto
   * @returns
   */
  async getFiles(dto: GetFilesDto & HeaderParamsDto): Promise<ResultQuery> {
    const { ide_archi, ide_inarti, mode } = dto;

    const conditions = [
      { condition: 'public_arch = TRUE', mode: ['files', 'favorites'] },
      { condition: 'papelera_arch = TRUE', mode: ['trash'] },
      { condition: 'favorita_arch = TRUE', mode: ['favorites'] },
      { condition: isDefined(ide_archi) ? `a.sis_ide_arch = ${ide_archi}` : 'a.sis_ide_arch IS NULL', mode: ['files'] },
      {
        condition: isDefined(ide_inarti) ? `a.ide_inarti = ${ide_inarti}` : 'a.ide_inarti IS NULL',
        mode: ['files', 'favorites', 'trash'],
      },
    ];

    const whereClause = conditions
      .filter((cond) => cond.mode.includes(mode))
      .map((cond) => cond.condition)
      .join(' AND ');

    const query = new SelectQuery(`
        WITH archivo_aggregates AS (
            SELECT
                sis_ide_arch,
                COUNT(*) AS num_arch,
                SUM(peso_arch) AS sum_peso_arch
            FROM
                sis_archivo
            WHERE
                public_arch = TRUE
            GROUP BY
                sis_ide_arch
        )
        SELECT
            a.ide_arch,
            a.nombre_arch AS name,
            a.extension_arch AS url,
            a.carpeta_arch,
            a.peso_arch AS size,
            a.usuario_ingre,
            a.fecha_ingre || ' ' || a.hora_ingre AS fecha_ingre,
            a.fecha_actua || ' ' || a.hora_actua AS fecha_actua,
            a.sis_ide_arch,
            a.uuid AS id,
            a.usuario_ingre,
            a.favorita_arch,
            a.descargas_arch AS descargas,
            COALESCE(agg.num_arch, 0) AS num_arch,
            COALESCE(agg.sum_peso_arch, 0) AS sum_peso_arch
        FROM
            sis_archivo a
        LEFT JOIN archivo_aggregates agg ON a.ide_arch = agg.sis_ide_arch
        WHERE ${whereClause}
              AND ide_empr = ${dto.ideEmpr}
               ${mode !== 'trash' ? `AND papelera_arch = FALSE` : ''}
        ORDER BY
            carpeta_arch desc, nombre_arch
        `);

    const data = await this.dataSource.createSelectQuery(query);
    data.map(function (obj) {
      if (obj.carpeta_arch === true) {
        obj.type = 'folder';
        obj.size = Number(obj.sum_peso_arch);
        obj.totalFiles = Number(obj.num_arch);
      } else {
        obj.type = getExtensionFile(obj.name); // getFileType(obj.type_arch);
        obj.url = `${HOST_API()}/api/sistema/files/downloadFile/${obj.id}.${obj.type}`;
      }
      obj.tags = [];
      obj.shared = [];
      obj.isFavorited = obj.favorita_arch;
      obj.createdAt = toDate(obj.fecha_ingre, FORMAT_DATETIME_DB());
      obj.modifiedAt = toDate(obj.fecha_actua || obj.fecha_ingre, FORMAT_DATETIME_DB());
      delete obj.fecha_ingre;
      delete obj.fecha_actua;
      delete obj.sum_peso_arch;
      delete obj.num_arch;
      delete obj.favorita_arch;
      delete obj.carpeta_arch;
      return obj;
    });
    return {
      rowCount: data.length,
      rows: data,
    } as ResultQuery;
  }

  /**
   * Sube un archivo a un directorio determinado
   * @param dto
   * @param file
   * @returns
   */
  async uploadFile(dto: UploadFileDto & HeaderParamsDto, file: Express.Multer.File): Promise<ResultQuery> {
    const { sis_ide_arch, ide_inarti } = dto;
    const exist = await this._checkExistFile(file.originalname, sis_ide_arch ? Number(sis_ide_arch) : undefined);
    if (exist === false) {
      const name = getUuidNameFile(file.filename);
      const extension = getExtensionFile(file.originalname);
      // inserta
      const insertQuery = new InsertQuery(this.tableName, this.primaryKey, dto);
      insertQuery.values.set('nombre_arch', file.originalname);
      insertQuery.values.set('nombre2_arch', `${name}.${extension}`);
      insertQuery.values.set('peso_arch', file.size);
      insertQuery.values.set('carpeta_arch', false);
      insertQuery.values.set('sis_ide_arch', sis_ide_arch ? Number(sis_ide_arch) : null);
      insertQuery.values.set('ide_inarti', ide_inarti ? Number(ide_inarti) : null);
      insertQuery.values.set('public_arch', true);
      insertQuery.values.set('favorita_arch', false);
      insertQuery.values.set('uuid', name);
      insertQuery.values.set('type_arch', file.mimetype);
      insertQuery.values.set('extension_arch', extension);
      insertQuery.values.set('descargas_arch', 0);
      insertQuery.values.set('ide_empr', dto.ide_empr);

      insertQuery.values.set(
        this.primaryKey,
        await this.dataSource.getSeqTable(this.tableName, this.primaryKey, 1, dto.login),
      );
      await this.dataSource.createQuery(insertQuery);
    } else {
      const updateQuery = new UpdateQuery(this.tableName, this.primaryKey, dto);
      const whereClause = `nombre_arch = $1 AND ${isDefined(sis_ide_arch) ? 'sis_ide_arch = $2' : 'sis_ide_arch IS NULL'}`;
      updateQuery.values.set('nombre_arch', file.originalname);
      updateQuery.where = whereClause;
      updateQuery.addParam(1, file.originalname);
      if (sis_ide_arch) {
        updateQuery.addParam(2, Number(sis_ide_arch));
      }
      await this.dataSource.createQuery(updateQuery);
    }
    return {
      message: `Archivo ${file.originalname} creado exitosamente`,
    } as ResultQuery;
  }

  async uploadOriginalFile(file: Express.Multer.File): Promise<ResultQuery> {
    return {
      message: `Archivo ${file.originalname} cargado exitosamente`,
    } as ResultQuery;
  }

  /**
   * Elimina un archivo
   * @param dto
   * @returns
   */
  async deleteFiles(dto: DeleteFilesDto & HeaderParamsDto): Promise<ResultQuery> {
    const query = new SelectQuery(`
        SELECT
            ide_arch,
            carpeta_arch,
            nombre2_arch as name
        FROM
            sis_archivo
        WHERE
            uuid =  ANY ($1)
        OR sis_ide_arch in (SELECT ide_arch FROM sis_archivo WHERE  carpeta_arch = true and uuid =  ANY ($2) )
        `);

    query.addParam(1, dto.values);
    query.addParam(2, dto.values);

    const data = await this.dataSource.createSelectQuery(query);

    if (data.length === 0) {
      throw new BadRequestException('No se encontraron los archivos');
    }

    if (dto.trash === false) {
      const deleteQuery = new DeleteQuery(this.tableName);
      deleteQuery.where = `uuid = ANY($1)`;
      deleteQuery.addParam(1, dto.values);
      await this.dataSource.createQuery(deleteQuery);

      data.forEach((row) => {
        // Elimina archivos
        if (row.carpeta_arch === false) {
          const filePath = join(FILE_STORAGE_CONSTANTS.BASE_PATH, row.name);
          try {
            unlinkSync(filePath);
          } catch (error) {
            this.errorLog.createErrorLog(`No se pudo borrar el archivo ${filePath} : ${error}`);
          }
        }
      });
      return {
        message: 'Archivos borrados exitosamente',
      } as ResultQuery;
    } else {
      const updateQuery = new UpdateQuery(this.tableName, this.primaryKey, dto);
      updateQuery.values.set('papelera_arch', true);
      updateQuery.values.set('hora_papelera_arch', getCurrentDateTime());
      updateQuery.where = `uuid = ANY($1)`;
      updateQuery.addParam(1, dto.values);
      await this.dataSource.createQuery(updateQuery);
      return {
        message: 'Archivos enviados a elementos de la Papelera',
      } as ResultQuery;
    }
  }

  /**
   * Descarga un archivo
   * @param uuid
   * @param res
   */
  async downloadFile(uuid: string, res: Response) {
    const name = getUuidNameFile(uuid);
    const query = new SelectQuery(`
        SELECT
            nombre2_arch as name,
            nombre_arch,
            type_arch,
            descargas_arch
        FROM
            sis_archivo
        WHERE
            uuid = $1`);
    query.addParam(1, name);
    const data = await this.dataSource.createSingleQuery(query);
    // Valida que retorne resultados
    if (!data) {
      throw new BadRequestException(`El archivo no existe`);
    }
    const updateQuery = new UpdateQuery(this.tableName, this.primaryKey);
    updateQuery.values.set('descargas_arch', Number(data.descargas_arch) + 1);
    updateQuery.where = `uuid = $1`;
    updateQuery.addParam(1, name);
    this.dataSource.createQuery(updateQuery);
    const filePath = join(FILE_STORAGE_CONSTANTS.BASE_PATH, data.name);
    if (!existsSync(filePath)) {
      throw new BadRequestException(`El archivo ${data.nombre_arch} no existe`);
    }
    const fileStream = createReadStream(filePath);
    fileStream.on('error', (err) => {
      throw new BadRequestException(`Error al leer el archivo: ${err.message}`);
    });
    const fileStat = statSync(filePath);
    const mimetype = data.type_arch || 'application/octet-stream';
    // Check file type and handle accordingly
    const fileType = getFileType(mimetype);
    if (fileType === 'image' || fileType === 'pdf' || fileType === 'video') {
      res.setHeader('Content-Type', mimetype);
      res.setHeader('Content-Length', fileStat.size);
      res.setHeader('Content-Disposition', `inline; filename="${data.nombre_arch}"`);
    } else {
      res.setHeader('Content-Type', mimetype);
      res.setHeader('Content-Length', fileStat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${data.nombre_arch}"`);
    }
    fileStream.pipe(res);
  }

  /**
   * Valida por nombre si existe un archivo en un directorio determinado
   * @param dto
   * @returns
   */
  async checkExistFile(dto: CheckExistFileDto) {
    const { fileName, sis_ide_arch } = dto;
    const exist = await this._checkExistFile(fileName, sis_ide_arch);
    return {
      message: `${exist === true ? 'El archivo ya existe' : 'El archivo no existe'}`,
      row: { exist, fileName },
      error: exist,
    } as ResultQuery;
  }

  /**
   * Renombra un archivo
   * @param dto
   * @returns
   */
  async renameFile(dto: RenameFileDto): Promise<ResultQuery> {
    //valida que el nombre nuevo no exista en el mismo directorio
    const whereClause = `
        WHERE nombre_arch = $1 AND uuid != $2
        ${isDefined(dto.sis_ide_arch) ? 'AND sis_ide_arch = $4' : 'AND sis_ide_arch IS NULL'}
    `;
    const query = new SelectQuery(`     
        SELECT
            1
        FROM
            sis_archivo
        ${whereClause}
        LIMIT 1`);
    query.addStringParam(1, dto.fileName);
    query.addStringParam(2, dto.id);
    if (isDefined(dto.sis_ide_arch)) query.addParam(3, dto.sis_ide_arch);
    const data = await this.dataSource.createSingleQuery(query);
    if (data) {
      throw new BadRequestException(`Ya existe un archivo con el nombre ${dto.fileName}`);
    }
    const updateQuery = new UpdateQuery(this.tableName, this.primaryKey, dto);
    updateQuery.values.set('nombre_arch', dto.fileName);
    updateQuery.where = `uuid = $1`;
    updateQuery.addParam(1, dto.id);
    await this.dataSource.createQuery(updateQuery);
    return {
      message: 'Archivo renombrado exitosamente',
    } as ResultQuery;
  }

  /**
   * Agrega/Quita de favoritos un archivo
   * @param dto
   * @returns
   */
  async favoriteFile(dto: FavoriteFileDto): Promise<ResultQuery> {
    const updateQuery = new UpdateQuery(this.tableName, this.primaryKey, dto);
    updateQuery.values.set('favorita_arch', dto.favorite);
    updateQuery.where = `uuid = $1`;
    updateQuery.addParam(1, dto.id);
    await this.dataSource.createQuery(updateQuery);
    return {
      message: 'Archivo agregado a favoritos',
    } as ResultQuery;
  }

  moveItem(sourcePath: string, destinationPath: string): string {
    const sourceFullPath = join(FILE_STORAGE_CONSTANTS.BASE_PATH, sourcePath);
    const destinationFullPath = join(FILE_STORAGE_CONSTANTS.BASE_PATH, destinationPath);
    if (!existsSync(sourceFullPath)) {
      throw new BadRequestException(`Source item ${sourcePath} does not exist`);
    }
    if (existsSync(destinationFullPath)) {
      throw new BadRequestException(`Destination item ${destinationPath} already exists`);
    }
    renameSync(sourceFullPath, destinationFullPath);
    return `Item moved from ${sourcePath} to ${destinationPath}`;
  }

  /**
   * Verifica si existe una archivo
   * @param name
   * @param sis_ide_arch
   * @returns
   */
  async _checkExistFile(name: string, sis_ide_arch?: number): Promise<boolean> {
    const whereClause = `
            WHERE nombre_arch = $1 and papelera_arch = false
            ${isDefined(sis_ide_arch) ? 'AND sis_ide_arch = $2' : 'AND sis_ide_arch IS NULL'}
        `;

    const query = new SelectQuery(`     
        SELECT
            1
        FROM
            sis_archivo
        ${whereClause}
        LIMIT 1`);
    query.addStringParam(1, name);
    if (isDefined(sis_ide_arch)) query.addParam(2, sis_ide_arch);
    const data = await this.dataSource.createSingleQuery(query);
    return data ? true : false;
  }

  //-------------------------------------------------------

  getStaticImage(imageName: string) {
    return getStaticImage(imageName);
  }

  deleteStaticFile(fileName: string) {
    const filePath = join(FILE_STORAGE_CONSTANTS.BASE_PATH, fileName);
    try {
      unlinkSync(filePath);
    } catch (error) {
      this.errorLog.createErrorLog(`No se pudo borrar el archivo ${filePath} : ${error}`);
      return {
        message: `No se pudo eliminar el archivo ${fileName}`,
      };
    }
    return {
      message: 'Archivo eliminado',
    };
  }
}
