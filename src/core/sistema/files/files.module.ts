import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';

@Module({
  controllers: [FilesController],
  providers: [DataSourceService, FilesService],
  imports: [
    ConfigModule, ErrorsModule
  ]
})
export class FilesModule { }
