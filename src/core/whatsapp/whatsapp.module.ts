import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { FileTempService } from '../modules/sistema/files/file-temp.service';

import { WebhookController } from './api/webhook.controller';
import { WhatsappApiService } from './api/whatsapp-api.service';
import { WhatsappCampaniaService } from './whatsapp-camp.service';
import { WhatsappDbService } from './whatsapp-db.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';
import { YcloudCampaniaService } from './ycloud/ycloud-camp.service';
import { YcloudMetricsService } from './ycloud/ycloud-metrics.service';
import { YcloudWebhookController } from './ycloud/ycloud-webhook.controller';
import { YcloudWindowService } from './ycloud/ycloud-window.service';
import { YcloudController } from './ycloud/ycloud.controller';
import { YcloudService } from './ycloud/ycloud.service';

@Module({
  imports: [HttpModule],
  controllers: [WhatsappController, WebhookController, YcloudController, YcloudWebhookController],
  providers: [
    WhatsappApiService,
    WhatsappGateway,
    WhatsappDbService,
    WhatsappService,
    FileTempService,
    WhatsappCampaniaService,
    YcloudService,
    YcloudCampaniaService,
    YcloudWindowService,
    YcloudMetricsService,
  ],
  exports: [
    WhatsappApiService,
    WhatsappGateway,
    WhatsappDbService,
    WhatsappService,
    FileTempService,
    WhatsappCampaniaService,
    YcloudService,
    YcloudCampaniaService,
    YcloudWindowService,
    YcloudMetricsService,
  ],
})
export class WhatsappModule { }
