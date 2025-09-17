import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { CampaignService } from '../services/campaign.service';
import { CAMPAIGN_QUEUE } from '../config';


@Processor(CAMPAIGN_QUEUE)
export class CampaignProcessor {
    private readonly logger = new Logger(CampaignProcessor.name);

    constructor(private readonly campaignService: CampaignService) { }

    @Process('process-campaign')
    async handleProcessCampaign(job: Job) {
        try {
            const { campaignId, ideEmpr } = job.data;
            this.logger.log(`Procesando campaña: ${campaignId}`);

            const result = await this.campaignService.processCampaign(campaignId, ideEmpr);

            this.logger.log(`Campaña ${campaignId} procesada: ${result.enviados} enviados, ${result.fallidos} fallidos`);

            return {
                success: true,
                campaignId,
                enviados: result.enviados,
                fallidos: result.fallidos
            };
        } catch (error) {
            this.logger.error(`Error procesando campaña: ${error.message}`);

            if (job.attemptsMade < 2) {
                throw error; // Reintentar
            }

            return { success: false, error: error.message };
        }
    }

    @Process('schedule-campaigns')
    async handleScheduleCampaigns(job: Job) {
        try {
            this.logger.log('Programando campañas pendientes');
            await this.campaignService.scheduleCampaigns();
            return { success: true, scheduled: true };
        } catch (error) {
            this.logger.error(`Error programando campañas: ${error.message}`);
            throw error;
        }
    }
}