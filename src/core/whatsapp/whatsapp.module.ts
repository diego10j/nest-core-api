import { Module } from '@nestjs/common';
import { WhatsappService } from './api/whatsapp.service';
import { WhatsappController } from './api/whatsapp.controller';
import { ErrorsModule } from 'src/errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { HttpModule } from '@nestjs/axios';
import { WebhookController } from './api/webhook.controller';
import { WhatsappGateway } from './api/whatsapp.gateway';
import { WhatsappWebService } from './web/whatsapp-web.service';
import { WhatsappWebController } from './web/whatsapp-web.controller';

@Module({
  imports: [ErrorsModule, HttpModule],
  controllers: [WhatsappController, WhatsappWebController,WebhookController],
  providers: [DataSourceService, WhatsappService, WhatsappGateway, WhatsappWebService],
  exports: [WhatsappWebService],
})
export class WhatsappModule { }
