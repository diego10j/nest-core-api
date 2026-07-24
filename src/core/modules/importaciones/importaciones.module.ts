import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';

import { CuentasPorPagarModule } from '../cuentas-por-pagar/cuentas-por-pagar.module';

import { ImportacionesSaveService } from './importaciones-save.service';
import { ImportacionesController } from './importaciones.controller';
import { ImportacionesService } from './importaciones.service';

@Module({
    imports: [CuentasPorPagarModule],
    controllers: [ImportacionesController],
    providers: [ImportacionesService, ImportacionesSaveService, CoreService],
})
export class ImportacionesModule { }
