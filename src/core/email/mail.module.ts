import { BullModule } from '@nestjs/bull';
import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CAMPAIGN_QUEUE, MAIL_QUEUE } from './config';
import { CampaignController } from './controllers/campaign.controller';
import { MailController } from './controllers/mail.controller';
import { TemplateController } from './controllers/template.controller';
import { CampaignProcessor } from './queues/campaign.processor';
import { MailProcessor } from './queues/mail.processor';
import { AdjuntoCorreoService } from './services/adjunto.service';
import { CampaignService } from './services/campaign.service';
import { MailService } from './services/mail.service';
import { QueueMonitorService } from './services/queue-monitor.service';
import { TemplateService } from './services/template.service';
import { TestMailService } from './services/test-mail.service';

// Importar todas las entidades

@Global()
@Module({
  imports: [
    // Para procesamiento automático periódico
    ScheduleModule.forRoot(),

    // Configuración de colas
    BullModule.registerQueue(
      {
        name: MAIL_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
      {
        name: CAMPAIGN_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
    ),
  ],
  controllers: [MailController, CampaignController, TemplateController],
  providers: [
    MailService,
    TestMailService,
    CampaignService,
    TemplateService,
    MailProcessor,
    CampaignProcessor,
    QueueMonitorService,
    AdjuntoCorreoService,
  ],
  exports: [MailService, CampaignService, TemplateService, TestMailService],
})
export class MailModule {}
