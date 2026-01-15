import { join } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './core/auth/auth.module';
import { DataSourceModule } from './core/connection/datasource.module';
import { CoreModule } from './core/core.module';
import { MailModule } from './core/email/mail.module';
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
    // Rate Limiting - Protección contra fuerza bruta
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minuto
      limit: 30,  // 30 peticiones por minuto (general)
    }]),
    RedisModule,
    DataSourceModule,
    CoreModule,
    AuthModule,
    ErrorsModule,
    WhatsappModule,
    ReportsModule,
    MailModule,
  ],
  providers: [
    // Guard global para rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
