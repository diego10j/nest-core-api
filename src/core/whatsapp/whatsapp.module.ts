import { Module } from '@nestjs/common';
import { WhatsappApiService } from './api/whatsapp-api.service';
import { WhatsappController } from './whatsapp.controller';
import { ErrorsModule } from 'src/errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { HttpModule } from '@nestjs/axios';
import { WebhookController } from './api/webhook.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappWebService } from './web/whatsapp-web.service';
import { WhatsappDbService } from './whatsapp-db.service';
import { WhatsappService } from './whatsapp.service';
import { FileTempService } from '../sistema/files/file-temp.service';
import { WhatsappCampaniaService } from './whatsapp-camp.service';


@Module({
  imports: [ErrorsModule, HttpModule],
  controllers: [WhatsappController, WebhookController],
  providers: [DataSourceService, WhatsappApiService, WhatsappGateway, WhatsappWebService, WhatsappDbService,WhatsappService,FileTempService, WhatsappCampaniaService],
  exports: [WhatsappService],
})
export class WhatsappModule { }
