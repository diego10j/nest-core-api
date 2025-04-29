import { Injectable, OnModuleDestroy, OnApplicationShutdown, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { MediaFile } from 'src/core/whatsapp/api/interface/whatsapp';
import { detectMimeType, getDefaultMimeTypeFromExtension, isVideoFile, MIME_TYPES } from 'src/core/whatsapp/web/helper/util';
import { PassThrough } from 'stream';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { PATH_DRIVE } from './helpers/fileNamer.helper';

const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);
const constants = fs.constants;
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

@Injectable()
export class FileTempService implements OnModuleDestroy, OnApplicationShutdown {
    private readonly basePath = PATH_DRIVE(); // Directorio base configurable
    public readonly tempDir = path.join(this.basePath, 'temp_media');

    // Configuración de tiempos (en milisegundos)
    private readonly fileLifetime = 15 * 24 * 3600 * 1000; // 15 días
    private readonly cleanupInterval = 3600 * 1000; // 1 hora entre limpiezas
    private cleanupTimer: NodeJS.Timeout;

    constructor() {
        this.ensureTempDirExists();
        this.setupCleanupInterval();
    }

    private ensureTempDirExists(): void {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    private setupCleanupInterval(): void {
        // Limpieza inicial inmediata
        this.cleanupOldFiles().catch(err =>
            console.error('Initial cleanup failed:', err)
        );

        // Programar limpieza periódica
        this.cleanupTimer = setInterval(async () => {
            await this.cleanupOldFiles();
        }, this.cleanupInterval);
    }

    async saveTempFile(data: Buffer, extension: string, originalName: string = undefined): Promise<{ filePath: string; fileName: string }> {
        const fileName = originalName ? originalName : `${uuidv4()}.${extension}`;
        const filePath = path.join(this.tempDir, fileName);

        await writeFile(filePath, data);
        return { filePath, fileName };
    }


    /**
     * Verifica si un archivo temporal existe
     * @param filename Nombre del archivo a verificar
     * @returns Promise<boolean> true si existe, false si no existe
     */
    async fileExists(filename: string): Promise<boolean> {
        const filePath = path.join(this.tempDir, filename);
        try {
            await access(filePath, constants.F_OK);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return false;
            }
            // Para otros tipos de errores (como permisos), consideramos que no existe
            console.error(`Error verificando archivo ${filename}:`, error);
            return false;
        }
    }


    async cleanupOldFiles(): Promise<void> {
        try {
            const now = Date.now();
            const files = await readdir(this.tempDir);
            const deletionPromises = [];

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);

                try {
                    const fileStat = await stat(filePath);
                    const fileAge = now - fileStat.mtimeMs;

                    if (fileAge > this.fileLifetime) {
                        deletionPromises.push(
                            unlink(filePath).catch(err =>
                                console.error(`Error deleting file ${filePath}:`, err)
                            )
                        );
                    }
                } catch (err) {
                    console.error(`Error checking file ${filePath}:`, err);
                }
            }

            await Promise.all(deletionPromises);

            if (deletionPromises.length > 0) {
                console.log(`Deleted ${deletionPromises.length} old temporary files`);
            }
        } catch (error) {
            console.error('Error during temp files cleanup:', error);
        }
    }

    async onModuleDestroy() {
        await this.cleanupAllFiles();
    }

    async onApplicationShutdown(signal?: string) {
        clearInterval(this.cleanupTimer);
        await this.cleanupAllFiles();
    }

    private async cleanupAllFiles(): Promise<void> {
        clearInterval(this.cleanupTimer);

        try {
            const files = await readdir(this.tempDir);
            await Promise.all(files.map(file =>
                unlink(path.join(this.tempDir, file)).catch(() => { }))
            );
            console.log(`Deleted all ${files.length} temporary files on shutdown`);
        } catch (error) {
            console.error('Error during final cleanup:', error);
        }
    }



    async downloadFile(response: Response, filename: string) {

        const filePath = path.join(this.tempDir, filename);

        try {
            //  Verificar existencia del archivo
            await promisify(fs.access)(filePath, fs.constants.R_OK);

            //  Obtener metadatos
            const stats = await promisify(fs.stat)(filePath);

            //  Determinar MIME type usando tus métodos
            const mimeType = detectMimeType(filename) || getDefaultMimeTypeFromExtension(filename);

            //  Configurar headers
            response.set({
                'Content-Type': mimeType,
                'Content-Length': stats.size,
                'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
                'Cache-Control': 'public, max-age=86400',
                'Last-Modified': stats.mtime.toUTCString(),
                'ETag': `"${stats.size}-${stats.mtime.getTime()}"`
            });

            //  Crear stream con manejo de errores
            const fileStream = fs.createReadStream(filePath);

            // Manejar eventos importantes
            fileStream.on('error', (err) => {
                if (!response.headersSent) {
                    response.status(500).send('Error al leer el archivo');
                }
                fileStream.destroy();
            });

            response.on('close', () => {
                if (!response.writableEnded) {
                    fileStream.destroy();
                }
            });

            //  Pipe directo a la respuesta
            return fileStream.pipe(response);

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new NotFoundException('Archivo no encontrado');
            }
            throw error;
        }
    }

    async downloadMediaFile(fileInfo: MediaFile, req: Request, res: Response) {
        try {
            // Verificar tamaño máximo del archivo
            if (fileInfo.fileSize && fileInfo.fileSize > MAX_FILE_SIZE) {
                throw new BadRequestException('El archivo es demasiado grande');
            }

            // Manejar solicitudes de rango para videos
            const range = req.headers.range;
            if (range && isVideoFile(fileInfo.mimeType)) {
                return this.handleVideoRangeRequest(fileInfo, range, res);
            }

            // Función helper para verificar MIME types
            const isMimeTypeInGroup = (group: Record<string, string>, mimeType: string): boolean => {
                return Object.values(group).some((mt) => mt === mimeType);
            };

            // Determinar disposición del contenido
            const isInline =
                isMimeTypeInGroup(MIME_TYPES.IMAGES, fileInfo.mimeType) ||
                isMimeTypeInGroup(MIME_TYPES.VIDEOS, fileInfo.mimeType) ||
                isMimeTypeInGroup(MIME_TYPES.STICKERS, fileInfo.mimeType);

            const contentDisposition = isInline
                ? `inline; filename="${encodeURIComponent(fileInfo.fileName)}"`
                : `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`;

            // Configuración común de headers
            const headers = {
                'Content-Type': fileInfo.mimeType,
                'Content-Disposition': contentDisposition
            };

            // Manejo de archivo temporal
            if (fileInfo.url) {
                const fileName = fileInfo.url.split('/').pop();
                const filePath = path.join(this.tempDir, fileName);
                const stats = fs.statSync(filePath);

                if (!stats.isFile()) {
                    throw new NotFoundException('Archivo no encontrado');
                }

                Object.assign(headers, {
                    'Content-Length': stats.size,
                    'Last-Modified': stats.mtime.toUTCString(),
                    'ETag': `"${stats.size}-${stats.mtime.getTime()}"`
                });

                if (stats.size > LARGE_FILE_THRESHOLD) {
                    headers['Accept-Ranges'] = 'bytes';
                }


                res.set(headers);

                const fileStream = fs.createReadStream(filePath)

                this.setupStreamErrorHandling(fileStream, res);
                return fileStream.pipe(res);
            }

            // Manejo de archivo en memoria
            Object.assign(headers, {
                'Content-Length': fileInfo.fileSize
            });

            res.set(headers);

            const bufferStream = new PassThrough();
            bufferStream.end(Buffer.from(fileInfo.data));

            // Manejo de cierre prematuro para buffer
            res.on('close', () => {
                if (!res.writableEnded) {
                    bufferStream.destroy();
                }
            });

            return bufferStream.pipe(res);

        } catch (error) {
            this.handleDownloadError(error);
        }
    }

    private handleVideoRangeRequest(fileInfo: MediaFile, range: string, res: Response) {
        const filePath = path.join(this.tempDir, fileInfo.url.split('/').pop());
        const stats = fs.statSync(filePath);

        if (!stats.isFile()) {
            throw new NotFoundException('Archivo de video no encontrado');
        }

        const fileSize = stats.size;
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
            res.status(416).header({
                'Content-Range': `bytes */${fileSize}`
            }).send();
            return;
        }

        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': fileInfo.mimeType,
            'Content-Disposition': `inline; filename="${encodeURIComponent(fileInfo.fileName)}"`
        });

        this.setupStreamErrorHandling(fileStream, res);
        return fileStream.pipe(res);
    }

    private setupStreamErrorHandling(stream: fs.ReadStream | PassThrough, res: Response) {
        stream.on('error', (error) => {
            stream.destroy();
            if (!res.headersSent) {
                throw new InternalServerErrorException('Error al transmitir el archivo');
            }
        });

        res.on('close', () => {
            if (!res.writableEnded) {
                stream.destroy();
            }
        });
    }

    private handleDownloadError(error: any) {
        if (error.code === 'ENOENT') {
            throw new NotFoundException('Archivo no encontrado');
        }
        if (error instanceof BadRequestException ||
            error instanceof NotFoundException) {
            throw error;
        }
        throw new InternalServerErrorException('Error al descargar el archivo multimedia');
    }


}