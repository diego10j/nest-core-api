import { Module } from '@nestjs/common';
import { WhatsappApiService } from './api/whatsapp-api.service';
import { WhatsappController } from './whatsapp.controller';
import { HttpModule } from '@nestjs/axios';
import { WebhookController } from './api/webhook.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappWebService } from './web/whatsapp-web.service';
import { WhatsappDbService } from './whatsapp-db.service';
import { WhatsappService } from './whatsapp.service';
import { FileTempService } from '../modules/sistema/files/file-temp.service';
import { WhatsappCampaniaService } from './whatsapp-camp.service';


@Module({
  imports: [ HttpModule],
  controllers: [WhatsappController, WebhookController],
  providers: [ WhatsappApiService, WhatsappGateway, WhatsappWebService, WhatsappDbService,WhatsappService,FileTempService, WhatsappCampaniaService],
  exports: [WhatsappApiService, WhatsappGateway, WhatsappWebService, WhatsappDbService,WhatsappService,FileTempService, WhatsappCampaniaService],
})
export class WhatsappModule { }
