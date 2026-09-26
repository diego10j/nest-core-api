import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { FileTempService } from './file-temp.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  // ArchivoSubidoEmitter viene de ArchivoEventosModule (global, una sola instancia).
  providers: [FilesService, FileTempService],
  exports: [FilesService, FileTempService],
  imports: [ConfigModule],
})
export class FilesModule {}
