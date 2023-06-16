import { join } from 'path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';

import { CommonModule } from './common/common.module';
import { FilesModule } from './files/files.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './core/auth/auth.module';
import { ErrorsModule } from './errors/errors.module';

@Module({
  imports: [
    ConfigModule.forRoot(),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      autoLoadEntities: false,
      synchronize: false,
    }),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    CommonModule,
    FilesModule,
    AuthModule,
    CoreModule,
    ErrorsModule,
  ],
})
export class AppModule { }
