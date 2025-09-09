import { join } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';

import { AuthModule } from './core/auth/auth.module';
import { DataSourceModule } from './core/connection/datasource.module';
import { CoreModule } from './core/core.module';
import { WhatsappModule } from './core/whatsapp/whatsapp.module';
import { ErrorsModule } from './errors/errors.module';
import { RedisModule } from './redis/redis.module';

import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    ConfigModule.forRoot(),
    RedisModule,
    DataSourceModule,
    CoreModule,
    AuthModule,
    ErrorsModule,
    WhatsappModule,
    ReportsModule,
  ],
})
export class AppModule { }
