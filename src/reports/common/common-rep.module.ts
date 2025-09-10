import { Global, Module } from '@nestjs/common';
import { SectionsService } from './services/sections.service';
import { EmpresaRepService } from './services/empresa-rep.service';

@Global() //  Hace que este módulo y sus exports sean globales
@Module({
  providers: [SectionsService, EmpresaRepService],
  exports: [SectionsService, EmpresaRepService],
})
export class CommonRepModule {}
