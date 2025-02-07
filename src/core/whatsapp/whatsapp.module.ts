import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { ErrorsModule } from 'src/errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { HttpModule } from '@nestjs/axios';
import { WebhookController } from './webhook.controller';
import { WhatsappGateway } from './whatsapp.gateway';

@Module({
  imports: [ErrorsModule, HttpModule],
  controllers: [WhatsappController, WebhookController],
  providers: [DataSourceService, WhatsappService, WhatsappGateway]
})
export class WhatsappModule { }
