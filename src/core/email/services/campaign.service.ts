import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { CreateCampaignDto } from '../dto/create-campaign.dto';
import { MailService } from './mail.service';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CAMPAIGN_QUEUE } from '../config';

@Injectable()
export class CampaignService {
    private readonly logger = new Logger(CampaignService.name);

    constructor(
        public readonly dataSource: DataSourceService,
        private readonly mailService: MailService,
        @InjectQueue(CAMPAIGN_QUEUE) private readonly campaignQueue: Queue,
    ) { }

    /**
     * Obtiene una campaña por ID
     */
    async getCampaignById(ide_caco: number, ideEmpr: number) {
        const query = new SelectQuery(`
            SELECT
                ide_caco,
                nombre_caco,
                asunto_caco,
                contenido_caco,
                destinatarios_caco,
                estado_caco,
                enviados_caco,
                fallidos_caco,
                programacion_caco,
                ide_corr,
                usuario_ingre,
                fecha_ingre,
                usuario_actua,
                fecha_actua
            FROM
                sis_campania_correo
            WHERE
                ide_caco = $1
                AND ide_empr = $2
        `);
        query.addParam(1, ide_caco);
        query.addParam(2, ideEmpr);

        const campaign = await this.dataSource.createSingleQuery(query);
        if (!campaign) {
            throw new NotFoundException(`Campaña con ID ${ide_caco} no encontrada`);
        }

        return campaign;
    }

    /**
     * Crea una nueva campaña de correo y programa su procesamiento
     */
    async createCampaign(createCampaignDto: CreateCampaignDto, ideEmpr: number, ideUsua: number, usuario: string) {
        try {
            // Obtener cuenta de correo
            const cuenta = await this.mailService.getCuentaCorreo(ideEmpr, createCampaignDto.ide_corr);

            const insertQuery = new InsertQuery('sis_campania_correo', 'ide_caco');
            const ide_caco = await this.dataSource.getSeqTable('sis_campania_correo', 'ide_caco', 1, usuario);
            insertQuery.values.set('ide_caco', ide_caco);
            insertQuery.values.set('nombre_caco', createCampaignDto.nombre);
            insertQuery.values.set('asunto_caco', createCampaignDto.asunto);
            insertQuery.values.set('contenido_caco', createCampaignDto.contenido);
            insertQuery.values.set('destinatarios_caco', JSON.stringify(createCampaignDto.destinatarios));
            insertQuery.values.set('estado_caco', 'PENDIENTE');
            insertQuery.values.set('programacion_caco', createCampaignDto.programacion || new Date());
            insertQuery.values.set('ide_corr', cuenta.ide_corr);
            insertQuery.values.set('ide_empr', ideEmpr);
            insertQuery.values.set('ide_usua', ideUsua);
            insertQuery.values.set('usuario_ingre', usuario);
            insertQuery.values.set('fecha_ingre', new Date());

            const result = await this.dataSource.createQuery(insertQuery);

            // Programar procesamiento de la campaña
            const programacionDate = createCampaignDto.programacion
                ? new Date(createCampaignDto.programacion)
                : new Date();

            const delay = programacionDate.getTime() - Date.now();

            await this.campaignQueue.add('process-campaign', {
                ide_caco: ide_caco,
                ide_empr: ideEmpr
            }, {
                delay: delay > 0 ? delay : 0,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 30000
                }
            });

            return {
                success: true,
                ide_caco: ide_caco,
                message: 'Campaña creada y programada exitosamente'
            };
        } catch (error) {
            this.logger.error(`Error createCampaign: ${error.message}`);
            throw new InternalServerErrorException(`Error al crear campaña: ${error.message}`);
        }
    }

    /**
     * Procesa una campaña de correo (este método es llamado por el processor)
     */
    async processCampaign(ide_caco: number, ide_empr: number) {
        try {
            const campaign = await this.getCampaignById(ide_caco, ide_empr);

            if (campaign.estado_caco !== 'PENDIENTE') {
                throw new BadRequestException('La campaña ya ha sido procesada');
            }

            // Actualizar estado a procesando
            await this.updateCampaignStatus(ide_caco, 'PROCESANDO');

            const destinatarios = JSON.parse(campaign.destinatarios_caco);
            let enviados = 0;
            let fallidos = 0;

            // Procesar cada destinatario
            for (const destinatario of destinatarios) {
                try {
                    // Agregar cada correo a la cola individual de MAIL
                    const sendMailDto = {
                        destinatario: destinatario.email,
                        asunto: campaign.asunto_caco,
                        contenido: campaign.contenido_caco,
                        ide_corr: campaign.ide_corr,
                        variables: destinatario.variables || {}
                    };

                    await this.mailService.sendMail(sendMailDto as any, ide_empr, 'sistema');
                    enviados++;
                } catch (error) {
                    this.logger.error(`Error enviando correo a ${destinatario.email}: ${error.message}`);
                    fallidos++;
                }

                // Actualizar progreso cada 10 envíos
                if ((enviados + fallidos) % 10 === 0) {
                    await this.updateCampaignProgress(ide_caco, enviados, fallidos);
                }
            }

            // Actualizar estado final
            const estadoFinal = fallidos === 0 ? 'COMPLETADA' : 'COMPLETADA_CON_ERRORES';
            await this.updateCampaignStatus(ide_caco, estadoFinal, enviados, fallidos);

            return { enviados, fallidos };
        } catch (error) {
            this.logger.error(`Error processCampaign: ${error.message}`);
            await this.updateCampaignStatus(ide_caco, 'ERROR', 0, 0, error.message);
            throw new InternalServerErrorException(`Error al procesar campaña: ${error.message}`);
        }
    }

    /**
     * Actualiza el estado de una campaña
     */
    private async updateCampaignStatus(ide_caco: number, estado: string, enviados: number = 0, fallidos: number = 0, error: string = null) {
        const updateQuery = new UpdateQuery('sis_campania_correo', 'ide_caco');
        updateQuery.values.set('estado_caco', estado);

        if (enviados > 0) {
            updateQuery.values.set('enviados_caco', enviados);
        }

        if (fallidos > 0) {
            updateQuery.values.set('fallidos_caco', fallidos);
        }

        if (error) {
            updateQuery.values.set('error_caco', error);
        }

        updateQuery.where = 'ide_caco = $1';
        updateQuery.addParam(1, ide_caco);

        await this.dataSource.createQuery(updateQuery);
    }

    /**
     * Actualiza el progreso de una campaña
     */
    private async updateCampaignProgress(ide_caco: number, enviados: number, fallidos: number) {
        const updateQuery = new UpdateQuery('sis_campania_correo', 'ide_caco');
        updateQuery.values.set('enviados_caco', enviados);
        updateQuery.values.set('fallidos_caco', fallidos);
        updateQuery.where = 'ide_caco = $1';
        updateQuery.addParam(1, ide_caco);

        await this.dataSource.createQuery(updateQuery);
    }

    /**
     * Programa el procesamiento de campañas pendientes
     */
    async scheduleCampaigns() {
        try {
            const query = new SelectQuery(`
                SELECT
                    ide_caco,
                    ide_empr
                FROM
                    sis_campania_correo
                WHERE
                    estado_caco = 'PENDIENTE'
                    AND programacion_caco <= NOW()
                ORDER BY
                    programacion_caco
                LIMIT 10
            `);

            const campaigns = await this.dataSource.createSelectQuery(query);

            for (const campaign of campaigns) {
                try {
                    // Agregar cada campaña pendiente a la cola
                    await this.campaignQueue.add('process-campaign', {
                        ide_caco: campaign.ide_caco,
                        ide_empr: campaign.ide_empr
                    });
                } catch (error) {
                    this.logger.error(`Error programando campaña ${campaign.ide_caco}: ${error.message}`);
                }
            }

            return { scheduled: campaigns.length };
        } catch (error) {
            this.logger.error(`Error scheduleCampaigns: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene todas las campañas de una empresa
     */
    async getCampaigns(ideEmpr: number) {
        const query = new SelectQuery(`
            SELECT
                ide_caco,
                nombre_caco,
                asunto_caco,
                estado_caco,
                enviados_caco,
                fallidos_caco,
                programacion_caco,
                fecha_ingre,
                usuario_ingre
            FROM
                sis_campania_correo
            WHERE
                ide_empr = $1
            ORDER BY
                fecha_ingre DESC
        `);
        query.addParam(1, ideEmpr);

        return await this.dataSource.createSelectQuery(query);
    }
}