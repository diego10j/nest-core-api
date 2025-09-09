import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { FileTempService } from '../modules/sistema/files/file-temp.service';

import { WebhookController } from './api/webhook.controller';
import { WhatsappApiService } from './api/whatsapp-api.service';
import { WhatsappWebService } from './web/whatsapp-web.service';
import { WhatsappCampaniaService } from './whatsapp-camp.service';
import { WhatsappDbService } from './whatsapp-db.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [HttpModule],
  controllers: [WhatsappController, WebhookController],
  providers: [
    WhatsappApiService,
    WhatsappGateway,
    WhatsappWebService,
    WhatsappDbService,
    WhatsappService,
    FileTempService,
    WhatsappCampaniaService,
  ],
  exports: [
    WhatsappApiService,
    WhatsappGateway,
    WhatsappWebService,
    WhatsappDbService,
    WhatsappService,
    FileTempService,
    WhatsappCampaniaService,
  ],
})
export class WhatsappModule {}
