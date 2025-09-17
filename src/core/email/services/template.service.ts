import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';


import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

@Injectable()
export class TemplateService {
    private readonly logger = new Logger(TemplateService.name);
    private templateCache = new Map<string, handlebars.TemplateDelegate>();

    constructor(
        public readonly dataSource: DataSourceService,
    ) {
        this.precompileBuiltInTemplates();
    }

    /**
     * Precompila las plantillas integradas
     */
    private precompileBuiltInTemplates() {
        const templateNames = ['user-created', 'password-reset', 'password-change', 'notification'];

        templateNames.forEach(name => {
            try {
                const templatePath = path.join(__dirname, 'templates', `${name}.hbs`);
                if (fs.existsSync(templatePath)) {
                    const templateSource = fs.readFileSync(templatePath, 'utf8');
                    this.templateCache.set(name, handlebars.compile(templateSource));
                    this.logger.log(`Plantilla precompilada: ${name}`);
                }
            } catch (error) {
                this.logger.warn(`Plantilla ${name} no encontrada, omitiendo precompilación`);
            }
        });
    }

    /**
     * Obtiene todas las plantillas de correo
     */
    async getTemplates(ideEmpr: number) {
        const query = new SelectQuery(`
      SELECT
        ide_plco,
        nombre_plco,
        asunto_plco,
        contenido_plco,
        variables_plco,
        estado_plco,
        ide_corr,
        usuario_ingre,
        fecha_ingre,
        usuario_actua,
        fecha_actua
      FROM
        sis_plantilla_correo
      WHERE
        ide_empr = $1
      ORDER BY
        nombre_plco
    `);
        query.addParam(1, ideEmpr);

        return await this.dataSource.createSelectQuery(query);
    }

    /**
     * Obtiene una plantilla por ID
     */
    async getTemplateById(idePlco: number, ideEmpr: number) {
        const query = new SelectQuery(`
      SELECT
        ide_plco,
        nombre_plco,
        asunto_plco,
        contenido_plco,
        variables_plco,
        estado_plco,
        ide_corr,
        usuario_ingre,
        fecha_ingre,
        usuario_actua,
        fecha_actua
      FROM
        sis_plantilla_correo
      WHERE
        ide_plco = $1
        AND ide_empr = $2
    `);
        query.addParam(1, idePlco);
        query.addParam(2, ideEmpr);

        const template = await this.dataSource.createSingleQuery(query);
        if (!template) {
            throw new NotFoundException(`Plantilla con ID ${idePlco} no encontrada`);
        }

        return template;
    }

    /**
     * Obtiene una plantilla por nombre
     */
    async getTemplateByName(nombre: string, ideEmpr: number) {
        const query = new SelectQuery(`
      SELECT
        ide_plco,
        nombre_plco,
        asunto_plco,
        contenido_plco,
        variables_plco,
        estado_plco,
        ide_corr,
        usuario_ingre,
        fecha_ingre,
        usuario_actua,
        fecha_actua
      FROM
        sis_plantilla_correo
      WHERE
        nombre_plco = $1
        AND ide_empr = $2
        AND estado_plco = true
    `);
        query.addStringParam(1, nombre);
        query.addParam(2, ideEmpr);

        return await this.dataSource.createSingleQuery(query);
    }

    /**
     * Crea una nueva plantilla
     */
    async createTemplate(createTemplateDto: CreateTemplateDto, ideEmpr: number, ideUsua: number, usuario: string) {
        try {
            // Verificar si ya existe una plantilla con el mismo nombre
            const existingTemplate = await this.getTemplateByName(createTemplateDto.nombre, ideEmpr);
            if (existingTemplate) {
                throw new BadRequestException('Ya existe una plantilla con este nombre');
            }

            const insertQuery = new InsertQuery('sis_plantilla_correo', 'ide_plco');
            insertQuery.values.set('nombre_plco', createTemplateDto.nombre);
            insertQuery.values.set('asunto_plco', createTemplateDto.asunto);
            insertQuery.values.set('contenido_plco', createTemplateDto.contenido);
            insertQuery.values.set('variables_plco', JSON.stringify(createTemplateDto.variables || []));
            insertQuery.values.set('estado_plco', true);
            insertQuery.values.set('ide_corr', createTemplateDto.ide_corr || null);
            insertQuery.values.set('ide_empr', ideEmpr);
            insertQuery.values.set('ide_usua', ideUsua);
            insertQuery.values.set('usuario_ingre', usuario);
            insertQuery.values.set('fecha_ingre', new Date());

            const result = await this.dataSource.createQuery(insertQuery);
            //  return await this.getTemplateById(result.ide_plco, ideEmpr);
            return { ok: 'ok' }
        } catch (error) {
            this.logger.error(`Error createTemplate: ${error.message}`);
            throw new InternalServerErrorException(`Error al crear plantilla: ${error.message}`);
        }
    }

    /**
     * Actualiza una plantilla existente
     */
    async updateTemplate(idePlco: number, updateTemplateDto: UpdateTemplateDto, ideEmpr: number, usuario: string) {
        try {
            // Verificar si la plantilla existe
            await this.getTemplateById(idePlco, ideEmpr);

            const updateQuery = new UpdateQuery('sis_plantilla_correo', 'ide_plco');
            updateQuery.values.set('nombre_plco', updateTemplateDto.nombre);
            updateQuery.values.set('asunto_plco', updateTemplateDto.asunto);
            updateQuery.values.set('contenido_plco', updateTemplateDto.contenido);

            if (updateTemplateDto.variables !== undefined) {
                updateQuery.values.set('variables_plco', JSON.stringify(updateTemplateDto.variables));
            }

            if (updateTemplateDto.estado !== undefined) {
                updateQuery.values.set('estado_plco', updateTemplateDto.estado);
            }

            if (updateTemplateDto.ide_corr !== undefined) {
                updateQuery.values.set('ide_corr', updateTemplateDto.ide_corr);
            }

            updateQuery.values.set('usuario_actua', usuario);
            updateQuery.values.set('fecha_actua', new Date());
            updateQuery.where = 'ide_plco = $1 AND ide_empr = $2';
            updateQuery.addParam(1, idePlco);
            updateQuery.addParam(2, ideEmpr);

            await this.dataSource.createQuery(updateQuery);
            return await this.getTemplateById(idePlco, ideEmpr);
        } catch (error) {
            this.logger.error(`Error updateTemplate: ${error.message}`);
            throw new InternalServerErrorException(`Error al actualizar plantilla: ${error.message}`);
        }
    }

    /**
     * Elimina una plantilla
     */
    async deleteTemplate(idePlco: number, ideEmpr: number) {
        try {
            // Verificar si la plantilla existe
            await this.getTemplateById(idePlco, ideEmpr);

            const deleteQuery = new DeleteQuery('sis_plantilla_correo');
            deleteQuery.where = 'ide_plco = $1 AND ide_empr = $2';
            deleteQuery.addParam(1, idePlco);
            deleteQuery.addParam(2, ideEmpr);

            await this.dataSource.createQuery(deleteQuery);
        } catch (error) {
            this.logger.error(`Error deleteTemplate: ${error.message}`);
            throw new InternalServerErrorException(`Error al eliminar plantilla: ${error.message}`);
        }
    }

    /**
     * Compila una plantilla con los datos proporcionados
     */
    compileTemplate(plantilla: string, variables: Record<string, any>): string {
        try {
            // Primero intentar usar Handlebars para plantillas más complejas
            const template = handlebars.compile(plantilla);
            return template(variables);
        } catch (error) {
            this.logger.warn(`Error compilando plantilla con Handlebars, usando reemplazo simple: ${error.message}`);

            // Fallback a reemplazo simple para plantillas básicas
            let compiledTemplate = plantilla;
            for (const [key, value] of Object.entries(variables)) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                compiledTemplate = compiledTemplate.replace(regex, value);
            }
            return compiledTemplate;
        }
    }

    /**
     * Compila una plantilla integrada por nombre
     */
    async compileBuiltInTemplate(templateName: string, variables: Record<string, any>): Promise<string> {
        try {
            // Primero buscar en caché
            if (this.templateCache.has(templateName)) {
                const template = this.templateCache.get(templateName);
                return template(variables);
            }

            // Si no está en caché, cargar desde archivo
            const templatePath = path.join(__dirname, 'templates', `${templateName}.hbs`);
            if (fs.existsSync(templatePath)) {
                const templateSource = fs.readFileSync(templatePath, 'utf8');
                const template = handlebars.compile(templateSource);
                this.templateCache.set(templateName, template);
                return template(variables);
            }

            throw new NotFoundException(`Plantilla integrada ${templateName} no encontrada`);
        } catch (error) {
            this.logger.error(`Error compilando plantilla integrada ${templateName}: ${error.message}`);
            throw new InternalServerErrorException(`Error al compilar plantilla: ${error.message}`);
        }
    }

    /**
     * Obtiene las plantillas integradas disponibles
     */
    getBuiltInTemplates(): string[] {
        const templatesDir = path.join(__dirname, 'templates');
        if (!fs.existsSync(templatesDir)) {
            return [];
        }

        const files = fs.readdirSync(templatesDir);
        return files
            .filter(file => file.endsWith('.hbs'))
            .map(file => file.replace('.hbs', ''));
    }
}