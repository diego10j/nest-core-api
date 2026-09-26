import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ArchivoSubidoEmitter } from './archivo-subido.emitter';
import { FileTempService } from './file-temp.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FileTempService, ArchivoSubidoEmitter],
  exports: [FilesService, FileTempService, ArchivoSubidoEmitter],
  imports: [ConfigModule],
})
export class FilesModule {}
