import { join } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ServeStaticModule } from '@nestjs/serve-static';

import { CommonModule } from './common/common.module';

import { CoreModule } from './core/core.module';
import { ErrorsModule } from './errors/errors.module';
import { RedisModule } from './redis/redis.module';
import { SistemaModule } from './core/sistema/sistema.module';

@Module({
  imports: [
    ConfigModule.forRoot(),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    CommonModule,
    CoreModule,
    ErrorsModule,
    SistemaModule,
    RedisModule,
  ],
})
export class AppModule { }
