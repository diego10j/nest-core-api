import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ArchivosCompartidosService } from './archivos-compartidos.service';
import { FileTempService } from './file-temp.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MarcaAguaService } from './marca-agua.service';

@Module({
  controllers: [FilesController],
  // ArchivoSubidoEmitter viene de ArchivoEventosModule (global, una sola instancia).
  providers: [FilesService, FileTempService, MarcaAguaService, ArchivosCompartidosService],
  exports: [FilesService, FileTempService, MarcaAguaService, ArchivosCompartidosService],
  imports: [ConfigModule],
})
export class FilesModule {}
