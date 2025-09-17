import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MailService } from './services/mail.service';
import { CampaignService } from './services/campaign.service';
import { TemplateService } from './services/template.service';
import { MailProcessor } from './queues/mail.processor';
import { CampaignProcessor } from './queues/campaign.processor';
import { MailController } from './controllers/mail.controller';
import { CampaignController } from './controllers/campaign.controller';
import { TemplateController } from './controllers/template.controller';
import { CAMPAIGN_QUEUE, MAIL_QUEUE } from './config';
import { TestMailService } from './services/test-mail.service';

// Importar todas las entidades

@Global()
@Module({
    imports: [
        BullModule.registerQueue(
            {
                name: MAIL_QUEUE,
                limiter: {
                    max: 30, // Máximo 30 emails por segundo
                    duration: 1000,
                },
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 1000,
                    },
                },
            },
            {
                name: CAMPAIGN_QUEUE,
                limiter: {
                    max: 20, // Más lento para campañas
                    duration: 1000,
                },
                defaultJobOptions: {
                    attempts: 2,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    },
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
    ],
    exports: [MailService, CampaignService, TemplateService, TestMailService],
})
export class MailModule { }