import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ApiPersonaController } from './api-persona/api-persona.controller';
import { ApiPersonaService } from './api-persona/api-persona.service';
import { GptController } from './gpt/gpt.controller';
import { GptService } from './gpt/gpt.service';

@Module({
  imports: [HttpModule],
  controllers: [ApiPersonaController, GptController],
  providers: [ApiPersonaService, GptService],
})
export class IntegrationModule {}
