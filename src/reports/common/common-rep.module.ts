import { Global, Module } from '@nestjs/common';

import { EmpresaRepService } from './services/empresa-rep.service';
import { SectionsService } from './services/sections.service';

@Global() //  Hace que este módulo y sus exports sean globales
@Module({
  providers: [SectionsService, EmpresaRepService],
  exports: [SectionsService, EmpresaRepService],
})
export class CommonRepModule {}
