import { join } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ServeStaticModule } from '@nestjs/serve-static';

import { CommonModule } from './common/common.module';
import { FilesModule } from './files/files.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './core/auth/auth.module';
import { ErrorsModule } from './errors/errors.module';
import { GeneralModule } from './core/general/general.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot(),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    CommonModule,
    FilesModule,
    AuthModule,
    CoreModule,
    ErrorsModule,
    GeneralModule,
    RedisModule,
  ],
})
export class AppModule { }
