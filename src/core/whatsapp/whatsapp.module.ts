import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { ProformasModule } from '../modules/proformas/proformas.module';
import { FileTempService } from '../modules/sistema/files/file-temp.service';

import { WebhookController } from './api/webhook.controller';
import { WhatsappApiService } from './api/whatsapp-api.service';
import { BotConfigService } from './bot/bot-config.service';
import { BotGptService } from './bot/bot-gpt.service';
import { BotProformaService } from './bot/bot-proforma.service';
import { BotScheduleService } from './bot/bot-schedule.service';
import { BotSessionService } from './bot/bot-session.service';
import { BotToolsService } from './bot/bot-tools.service';
import { BotController } from './bot/bot.controller';
import { BotService } from './bot/bot.service';
import { ChatLockService } from './chat-lock.service';
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
  imports: [
    HttpModule,
    forwardRef(() => ProformasModule),
  ],
  controllers: [
    WhatsappController,
    WebhookController,
    YcloudController,
    YcloudWebhookController,
    BotController,
  ],
  providers: [
    WhatsappApiService,
    WhatsappGateway,
    WhatsappDbService,
    WhatsappService,
    FileTempService,
    WhatsappCampaniaService,
    ChatLockService,
    // YCloud
    YcloudService,
    YcloudCampaniaService,
    YcloudWindowService,
    YcloudMetricsService,
    // Bot QuimIA
    BotConfigService,
    BotSessionService,
    BotGptService,
    BotToolsService,
    BotProformaService,
    BotScheduleService,
    BotService,
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
    BotConfigService,
    BotService,
  ],
})
export class WhatsappModule {}
