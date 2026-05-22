import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { ImportacionesController } from './importaciones.controller';
import { ImportacionesService } from './importaciones.service';
import { ImportacionesSaveService } from './importaciones-save.service';

@Module({
    imports: [],
    controllers: [ImportacionesController],
    providers: [ImportacionesService, ImportacionesSaveService, CoreService],
})
export class ImportacionesModule { }
