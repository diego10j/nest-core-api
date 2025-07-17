import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ApiPersonaService } from './api-persona/api-persona.service';
import { ApiPersonaController } from './api-persona/api-persona.controller';
import { GptController } from './gpt/gpt.controller';
import { GptService } from './gpt/gpt.service';

@Module({
  imports: [ HttpModule],
  controllers: [ApiPersonaController, GptController],
  providers: [ ApiPersonaService, GptService]
})
export class IntegrationModule { }
