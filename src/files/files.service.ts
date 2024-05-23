import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../core/connection/datasource.service';
import { SelectQuery } from '../core/connection/helpers/select-query';
import { GetFilesDto } from './dto/get-files.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { InsertQuery } from '../core/connection/helpers/insert-query';
import { isDefined } from '../core/util/helpers/common-util';


@Injectable()
export class FilesService {

    //  private basePath = '/drive'; // Cambiar a /drive como directorio raíz

    private basePath = 'C:/drive'; // Cambiar a /drive como directorio raíz

    private tableName = 'sis_archivo';
    private primaryKey = 'ide_arch';

    constructor(private readonly dataSource: DataSourceService) {
        if (!existsSync(this.basePath)) {
            mkdirSync(this.basePath, { recursive: true });
        }
    }


    async createFolder(dto: CreateFolderDto) {
        const { folderName, path, sis_ide_arch } = dto;
        const folderPath = join(`${this.basePath}${path}`, folderName);
        if (existsSync(folderPath)) {
            throw new BadRequestException(`Folder ${folderName} already exists`);
        }
        // inserta 
        const insertQuery = new InsertQuery(this.tableName, dto)
        insertQuery.values.set('nombre_arch', folderName);
        insertQuery.values.set('ruta_arch', path);
        insertQuery.values.set('carpeta_arch', true);
        insertQuery.values.set('sis_ide_arch', sis_ide_arch || null);
        insertQuery.values.set('public_arch', true);
        insertQuery.values.set(this.primaryKey, await this.dataSource.getSeqTable(this.tableName, this.primaryKey));
        await this.dataSource.createQuery(insertQuery);
        mkdirSync(folderPath);
        // mkdirSync(folderPath, { recursive: true });
        return {
            message: `Folder ${folderName} created successfully`
        };
    }



    async getFiles(dto: GetFilesDto) {
        const { ide_archi } = dto;

        let whereClause = 'WHERE public_arch = TRUE';
        if (isDefined(ide_archi))
            whereClause += ' AND sis_ide_arch = $1';
        else
            whereClause += ' AND sis_ide_arch is null';
        const query = new SelectQuery(`
        SELECT
            ide_arch,
            nombre_arch,
            ruta_arch,
            url_arch,
            carpeta_arch,
            peso_arch,
            usuario_ingre,
            fecha_ingre,
            type_arch,
            sis_ide_arch
        FROM
            sis_archivo
        ${whereClause}
        ORDER BY
            carpeta_arch, nombre_arch`);
        if (isDefined(ide_archi)) {
            query.addParam(1, ide_archi);
        }
        return await this.dataSource.createQueryPG(query);
    }

    uploadFile(folderName: string, file: Express.Multer.File): string {
        const folderPath = join(this.basePath, folderName);
        if (!existsSync(folderPath)) {
            throw new BadRequestException(`Folder ${folderName} does not exist`);
        }
        const filePath = join(folderPath, file.originalname);
        writeFileSync(filePath, file.buffer);
        return `File ${file.originalname} uploaded successfully to ${folderName}`;
    }

    deleteFolder(folderName: string): string {
        const folderPath = join(this.basePath, folderName);
        if (!existsSync(folderPath)) {
            throw new BadRequestException(`Folder ${folderName} does not exist`);
        }
        rmdirSync(folderPath, { recursive: true });
        return `Folder ${folderName} deleted successfully`;
    }

    deleteFile(folderName: string, fileName: string): string {
        const folderPath = join(this.basePath, folderName);
        const filePath = join(folderPath, fileName);
        if (!existsSync(filePath)) {
            throw new BadRequestException(`File ${fileName} does not exist in ${folderName}`);
        }
        unlinkSync(filePath);
        return `File ${fileName} deleted successfully from ${folderName}`;
    }

    renameItem(currentPath: string, newName: string): string {
        const oldPath = join(this.basePath, currentPath);
        const newPath = join(this.basePath, newName);
        if (!existsSync(oldPath)) {
            throw new BadRequestException(`Item ${currentPath} does not exist`);
        }
        if (existsSync(newPath)) {
            throw new BadRequestException(`Item ${newName} already exists`);
        }
        renameSync(oldPath, newPath);
        return `Item renamed from ${currentPath} to ${newName}`;
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
