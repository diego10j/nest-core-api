import { Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { DataSourceService } from "src/core/connection/datasource.service";
import { InsertQuery, SelectQuery } from "src/core/connection/helpers";


@Injectable()
export class AdjuntoCorreoService {
    private readonly logger = new Logger(AdjuntoCorreoService.name);

    constructor(private readonly dataSource: DataSourceService) { }

    /**
     * Sube un archivo y crea registro en adjuntos
     */
    async subirAdjunto(
        archivo: Express.Multer.File,
        referencias: { ide_plco?: number; ide_caco?: number; ide_coco?: number },
        usuario: string
    ): Promise<number> {
        try {
            // Guardar archivo en sistema de almacenamiento
            const rutaArchivo = await this.guardarArchivo(archivo);

            // Crear registro en BD
            const insertQuery = new InsertQuery('sis_adjunto_correo', 'ide_adco');

            const ide_adco = await this.dataSource.getSeqTable('sis_adjunto_correo', 'ide_adco', 1, usuario);

            insertQuery.values.set('ide_adco', ide_adco);
            insertQuery.values.set('nombre_archivo_adco', archivo.originalname);
            insertQuery.values.set('tipo_mime_adco', archivo.mimetype);
            insertQuery.values.set('tamano_adco', archivo.size);
            insertQuery.values.set('ruta_adco', rutaArchivo);
            insertQuery.values.set('ide_plco', referencias.ide_plco || null);
            insertQuery.values.set('ide_caco', referencias.ide_caco || null);
            insertQuery.values.set('ide_coco', referencias.ide_coco || null);
            insertQuery.values.set('usuario_ingre', usuario);
            insertQuery.values.set('fecha_ingre', new Date());

            await this.dataSource.createQuery(insertQuery);

            return ide_adco;
        } catch (error) {
            this.logger.error(`Error subiendo adjunto: ${error.message}`);
            throw new InternalServerErrorException('Error al subir adjunto');
        }
    }

    /**
     * Guarda el archivo en el sistema de almacenamiento
     */
    private async guardarArchivo(archivo: Express.Multer.File): Promise<string> {
        // Implementar lógica de almacenamiento según tu sistema
        // Ejemplo para sistema de archivos local:
        const fs = require('fs').promises;
        const path = require('path');

        const uploadDir = path.join(process.cwd(), 'uploads', 'adjuntos');
        const nombreUnico = `${Date.now()}-${archivo.originalname}`;
        const rutaCompleta = path.join(uploadDir, nombreUnico);

        // Crear directorio si no existe
        await fs.mkdir(uploadDir, { recursive: true });

        // Guardar archivo
        await fs.writeFile(rutaCompleta, archivo.buffer);

        return rutaCompleta;
    }

    /**
     * Descarga un adjunto
     */
    async descargarAdjunto(ide_adco: number): Promise<{ buffer: Buffer; nombre: string; tipoMime: string }> {
        const query = new SelectQuery(`
      SELECT nombre_archivo_adco, tipo_mime_adco, ruta_adco
      FROM sis_adjunto_correo
      WHERE ide_adco = $1
    `);
        query.addParam(1, ide_adco);

        const adjunto = await this.dataSource.createSingleQuery(query);

        if (!adjunto) {
            throw new NotFoundException('Adjunto no encontrado');
        }

        // Cargar archivo desde almacenamiento
        const buffer = await this.cargarArchivo(adjunto.ruta_adco);

        return {
            buffer,
            nombre: adjunto.nombre_archivo_adco,
            tipoMime: adjunto.tipo_mime_adco
        };
    }

    private async cargarArchivo(ruta: string): Promise<Buffer> {
        const fs = require('fs').promises;
        return await fs.readFile(ruta);
    }
}