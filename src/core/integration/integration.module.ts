import { Module } from '@nestjs/common';
import { ErrorsModule } from 'src/errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { HttpModule } from '@nestjs/axios';
import { ApiPersonaService } from './api-persona/api-persona.service';
import { ApiPersonaController } from './api-persona/api-persona.controller';

@Module({
  imports: [ErrorsModule, HttpModule],
  controllers: [ApiPersonaController],
  providers: [DataSourceService, ApiPersonaService]
})
export class IntegrationModule { }
