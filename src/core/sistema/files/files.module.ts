import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ErrorsModule } from '../../../errors/errors.module';
import { FileTempService } from './file-temp.service';

@Module({
  controllers: [FilesController],
  providers: [DataSourceService, FilesService,FileTempService],
  exports: [FileTempService],
  imports: [
    ConfigModule, ErrorsModule
  ]
})
export class FilesModule { }
