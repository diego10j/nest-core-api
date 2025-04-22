import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { PATH_DRIVE } from './helpers/fileNamer.helper';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

@Injectable()
export class FileTempService implements OnModuleDestroy {

    private readonly basePath = PATH_DRIVE(); // Cambiar a /drive o 'C:/drive' como directorio raíz

    public readonly tempDir = path.join(this.basePath, 'temp_media');
    private readonly fileLifetime = 15 * 24 * 3600 * 1000; // 15 días en milisegundos

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
        setInterval(async () => {
            await this.cleanupOldFiles();
        }, this.fileLifetime / 2); // Limpia cada 30 minutos
    }

    async saveTempFile(data: Buffer, extension: string): Promise<{ filePath: string; fileName: string }> {
        const fileName = `${uuidv4()}.${extension}`;
        const filePath = path.join(this.tempDir, fileName);

        await writeFile(filePath, data);
        return { filePath, fileName };
    }

    async getFileUrl(fileName: string): Promise<string> {
        return `/temp-media/${fileName}`;
    }

    async cleanupOldFiles(): Promise<void> {
        try {
            const files = await readdir(this.tempDir);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const fileStat = await stat(filePath);
                const fileAge = now - fileStat.mtimeMs;

                if (fileAge > this.fileLifetime) {
                    await unlink(filePath).catch(err =>
                        console.error(`Error deleting file ${filePath}:`, err)
                    );
                }
            }
        } catch (error) {
            console.error('Error during temp files cleanup:', error);
        }
    }

    async onModuleDestroy() {
        // Limpiar todos los archivos al detener la aplicación
        const files = await readdir(this.tempDir);
        await Promise.all(files.map(file =>
            unlink(path.join(this.tempDir, file)).catch(() => { })
        ));
    }
}