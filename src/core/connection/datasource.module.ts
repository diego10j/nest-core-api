// src/core/connection/datasource.module.ts
import { Global, Module } from '@nestjs/common';
import { ErrorsModule } from 'src/errors/errors.module';
import { RedisModule } from 'src/redis/redis.module';
import { VariablesService } from '../variables/variables.service';
import { DataSourceService } from './datasource.service';

@Global() //  Hace que este módulo y sus exports sean globales
@Module({
  imports: [RedisModule,ErrorsModule], // Importa RedisModule para tener acceso al cliente Redis
  providers: [DataSourceService,VariablesService],
  exports: [DataSourceService,VariablesService], //  Exporta el servicio para toda la app
})
export class DataSourceModule {}