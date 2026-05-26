import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { DocumentosCxPSaveService } from '../cuentas-por-pagar/documentos-cxp-save.service';
import { ImportacionesController } from './importaciones.controller';
import { ImportacionesService } from './importaciones.service';
import { ImportacionesSaveService } from './importaciones-save.service';

@Module({
    imports: [],
    controllers: [ImportacionesController],
    providers: [ImportacionesService, ImportacionesSaveService, DocumentosCxPSaveService, CoreService],
})
export class ImportacionesModule { }
