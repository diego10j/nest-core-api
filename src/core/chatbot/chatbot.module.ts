import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { ErrorsModule } from 'src/errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [ErrorsModule, HttpModule],
  controllers: [ChatbotController],
  providers: [DataSourceService, ChatbotService]
})
export class ChatbotModule { }
