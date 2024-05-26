import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Response } from 'express';
import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../core/connection/datasource.service';
import { GetFilesDto } from './dto/get-files.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { HOST_API, isDefined } from '../core/util/helpers/common-util';
import { PATH_DRIVE, getExtensionFile, getFileType, getUuidNameFile } from './helpers/fileNamer.helper';
import { UploadFileDto } from './dto/upload-file.dto';
import { DeleteQuery, SelectQuery, InsertQuery, UpdateQuery } from 'src/core/connection/helpers';
import { DeleteFilesDto } from './dto/delete-files.dto';
import { CheckExistFileDto } from './dto/check-exist-file.dto';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { RenameFileDto } from './dto/rename-file.dto';
import { toDate, FORMAT_DATETIME_DB } from '../core/util/helpers/date-util';
import { FavoriteFileDto } from './dto/favorite-file.dto';


@Injectable()
export class FilesService {

    private basePath = PATH_DRIVE(); // Cambiar a /drive como directorio raíz

    // private basePath = 'C:/drive'; // Cambiar a /drive como directorio raíz

    private tableName = 'sis_archivo';
    private primaryKey = 'ide_arch';

    constructor(private readonly dataSource: DataSourceService) {
        if (!existsSync(this.basePath)) {
            mkdirSync(this.basePath, { recursive: true });
        }
    }


    async createFolder(dto: CreateFolderDto): Promise<ResultQuery> {
        const { folderName, sis_ide_arch } = dto;
        if (await this._checkExistFile(folderName, sis_ide_arch)) {
            throw new BadRequestException(`La carpeta ${folderName} ya existe`);
        }
        // inserta 
        const insertQuery = new InsertQuery(this.tableName, dto)
        insertQuery.values.set('nombre_arch', folderName);
        insertQuery.values.set('carpeta_arch', true);
        insertQuery.values.set('sis_ide_arch', sis_ide_arch || null);
        insertQuery.values.set('public_arch', true);
        insertQuery.values.set('favorita_arch', false);
        insertQuery.values.set(this.primaryKey, await this.dataSource.getSeqTable(this.tableName, this.primaryKey));
        await this.dataSource.createQuery(insertQuery);

        return {
            message: `Carpeta ${folderName} creada exitosamente`
        } as ResultQuery;
    }



    async getFiles(dto: GetFilesDto): Promise<ResultQuery> {
        const { ide_archi } = dto;

        const whereClause = `
            WHERE public_arch = TRUE
            ${isDefined(ide_archi) ? ' AND sis_ide_arch = $1' : ' AND sis_ide_arch IS NULL'}`;

        const query = new SelectQuery(`
        SELECT
            ide_arch,
            nombre_arch as name,
            extension_arch as url,
            carpeta_arch,
            peso_arch as size,
            usuario_ingre,
            fecha_ingre || ' ' || hora_ingre  as fecha_ingre,
            fecha_actua || ' ' || hora_actua  as fecha_actua,
            sis_ide_arch,
            uuid as id,
            usuario_ingre,
            favorita_arch
        FROM
            sis_archivo
        ${whereClause}
        ORDER BY
            carpeta_arch desc, nombre_arch`);
        if (isDefined(ide_archi)) {
            query.addParam(1, ide_archi);
        }
        const res = await this.dataSource.createQueryPG(query);

        res.rows.map(function (obj) {
            if (obj.carpeta_arch === true) {
                // obj.id = `${obj.id}_folder`;
                obj.type = 'folder';
            }
            else {
                obj.type = getExtensionFile(obj.name);; // getFileType(obj.type_arch);
                obj.url = `${HOST_API()}/api/files/downloadFile/${obj.id}.${obj.type}`;
            }

            obj.tags = [];
            obj.shared = [];
            obj.isFavorited = obj.favorita_arch;
            obj.createdAt = toDate(obj.fecha_ingre, FORMAT_DATETIME_DB());
            obj.modifiedAt = toDate(obj.fecha_actua || obj.fecha_ingre, FORMAT_DATETIME_DB());
            delete obj.fecha_ingre
            delete obj.fecha_actua
            delete obj.fecha_actua

            return obj;
        });

        return res;

    }

    async uploadFile(dto: UploadFileDto, file: Express.Multer.File): Promise<ResultQuery> {
        const { sis_ide_arch } = dto;

        const exist = await this._checkExistFile(file.originalname, sis_ide_arch ? Number(sis_ide_arch) : undefined);
        if (exist === false) {
            const name = getUuidNameFile(file.filename);
            const extension = getExtensionFile(file.originalname);
            // inserta 
            const insertQuery = new InsertQuery(this.tableName, dto)
            insertQuery.values.set('nombre_arch', file.originalname);
            insertQuery.values.set('nombre2_arch', file.filename);
            insertQuery.values.set('peso_arch', file.size);
            insertQuery.values.set('carpeta_arch', false);
            insertQuery.values.set('sis_ide_arch', sis_ide_arch ? Number(sis_ide_arch) : null);
            insertQuery.values.set('public_arch', true);
            insertQuery.values.set('favorita_arch', false);
            insertQuery.values.set('uuid', name);
            insertQuery.values.set('type_arch', file.mimetype);
            insertQuery.values.set('extension_arch', extension);
            insertQuery.values.set('descargas_arch', 0);

            insertQuery.values.set(this.primaryKey, await this.dataSource.getSeqTable(this.tableName, this.primaryKey));
            await this.dataSource.createQuery(insertQuery);
        }
        else {
            const whereClause = `nombre_arch = $1 AND ${isDefined(sis_ide_arch) ? 'sis_ide_arch = $2' : 'sis_ide_arch IS NULL'}`;
            const updateQuery = new UpdateQuery(this.tableName, dto);
            updateQuery.values.set("nombre_arch", file.originalname)
            updateQuery.where = whereClause;
            updateQuery.addParam(1, file.originalname);
            if (sis_ide_arch) {
                updateQuery.addParam(2, Number(sis_ide_arch));
            }
            await this.dataSource.createQuery(updateQuery)
        }


        return {
            message: `Archivo ${file.originalname} creado exitosamente`
        } as ResultQuery;

    }


    async deleteFiles(dto: DeleteFilesDto): Promise<ResultQuery> {

        const query = new SelectQuery(`
        SELECT
            ide_arch,
            carpeta_arch,
            nombre2_arch as name
        FROM
            sis_archivo
        WHERE
            uuid =  ANY ($1)
        OR sis_ide_arch in (SELECT ide_arch FROM sis_archivo WHERE  carpeta_arch = true and uuid =  ANY ($2) )`);

        query.addParam(1, dto.values);
        query.addParam(2, dto.values);

        const data = await this.dataSource.createQuery(query);

        if (data.length === 0) {
            throw new BadRequestException('No se encontraron los archivos');
        }

        if (dto.trash === false) {

            const deleteQuery = new DeleteQuery(this.tableName);
            deleteQuery.where = `uuid = ANY($1)`;
            deleteQuery.addParam(1, dto.values);
            await this.dataSource.createQuery(deleteQuery)

            data.forEach(row => {
                // Elimina archivos 
                if (row.carpeta_arch === false) {
                    const filePath = join(this.basePath, row.name);
                    unlinkSync(filePath);
                }
            });
            return {
                message: 'Archivos borrados exitosamente'
            } as ResultQuery;

        }
        else {

            const updateQuery = new UpdateQuery(this.tableName, dto);
            updateQuery.values.set("public_arch", false);
            updateQuery.where = `uuid = ANY($1)`;
            updateQuery.addParam(1, dto.values);
            await this.dataSource.createQuery(updateQuery)
            return {
                message: 'Archivos enviados a elementos de la Papelera'
            } as ResultQuery;
        }
    }

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
            throw new BadRequestException(
                `El archivo no existe`
            );
        }

        const updateQuery = new UpdateQuery(this.tableName);
        updateQuery.values.set("descargas_arch", Number(data.descargas_arch) + 1);
        updateQuery.where = `uuid = $1`;
        updateQuery.addParam(1, name);
        this.dataSource.createQuery(updateQuery)

        const filePath = join(this.basePath, data.name);
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

    async checkExistFile(dto: CheckExistFileDto) {
        const { fileName, sis_ide_arch } = dto;
        const exist = await this._checkExistFile(fileName, sis_ide_arch);

        return {
            message: `${exist === true ? 'El archivo ya existe' : 'El archivo no existe'}`,
            row: { exist, fileName },
            error: exist
        } as ResultQuery;

    }


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
        if (isDefined(dto.sis_ide_arch))
            query.addParam(3, dto.sis_ide_arch);
        const data = await this.dataSource.createSingleQuery(query);


        if (data) {
            throw new BadRequestException(`Ya existe un archivo con el nombre ${dto.fileName}`);
        }


        const updateQuery = new UpdateQuery(this.tableName, dto);
        updateQuery.values.set("nombre_arch", dto.fileName);
        updateQuery.where = `uuid = $1`;
        updateQuery.addParam(1, dto.id);
        await this.dataSource.createQuery(updateQuery)
        return {
            message: 'Archivo renombrado exitosamente'
        } as ResultQuery;
    }

    async favoriteFile(dto: FavoriteFileDto): Promise<ResultQuery> {
        const updateQuery = new UpdateQuery(this.tableName, dto);
        updateQuery.values.set("favorita_arch", dto.favorite);
        updateQuery.where = `uuid = $1`;
        updateQuery.addParam(1, dto.id);
        await this.dataSource.createQuery(updateQuery)
        return {
            message: 'Archivo agregado a favoritos'
        } as ResultQuery;
    }


    moveItem(sourcePath: string, destinationPath: string): string {
        const sourceFullPath = join(this.basePath, sourcePath);
        const destinationFullPath = join(this.basePath, destinationPath);
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
    async _checkExistFile(name: string, sis_ide_arch?: number,): Promise<boolean> {

        const whereClause = `
            WHERE nombre_arch = $1
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
        if (isDefined(sis_ide_arch))
            query.addParam(2, sis_ide_arch);
        const data = await this.dataSource.createSingleQuery(query);
        return data ? true : false;
    }

    //-------------------------------------------------------


    getStaticImage(imageName: string) {
        let path = join(__dirname, '../../static/images', imageName);
        if (!existsSync(path))
            path = join(__dirname, '../../public/assets/images', 'no-image.png');
        if (!existsSync(path))
            throw new BadRequestException(`No image found with  ${imageName}`);
        return path;
    }

}
