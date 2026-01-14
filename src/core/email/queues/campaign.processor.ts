import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { CAMPAIGN_QUEUE } from '../config';
import { CampaignService } from '../services/campaign.service';

@Processor(CAMPAIGN_QUEUE)
export class CampaignProcessor {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(private readonly campaignService: CampaignService) {}

  @Process('process-campaign')
  async handleProcessCampaign(job: Job) {
    try {
      const { ide_caco, ide_empr } = job.data;
      this.logger.log(`Procesando campaña ID: ${ide_caco}`);

      const result = await this.campaignService.processCampaign(ide_caco, ide_empr);

      this.logger.log(`Campaña ${ide_caco} procesada: ${result.enviados} enviados, ${result.fallidos} fallidos`);

      return {
        success: true,
        ide_caco,
        enviados: result.enviados,
        fallidos: result.fallidos,
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
      const result = await this.campaignService.scheduleCampaigns();
      return {
        success: true,
        scheduled: result.scheduled,
      };
    } catch (error) {
      this.logger.error(`Error programando campañas: ${error.message}`);
      throw error;
    }
  }
}
