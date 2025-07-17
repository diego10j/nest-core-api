import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileTempService } from './file-temp.service';

@Module({
  controllers: [FilesController],
  providers: [ FilesService,FileTempService],
  exports: [FileTempService],
  imports: [
    ConfigModule
  ]
})
export class FilesModule { }
