import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { ChequesController } from './cheques/cheques.controller';
import { ChequesService } from './cheques/cheques.service';
import { PreLibroBancosConciliacionService } from './pre-libro-bancos/pre-libro-bancos-conciliacion.service';
import { PreLibroBancosController } from './pre-libro-bancos/pre-libro-bancos.controller';
import { PreLibroBancosSaveService } from './pre-libro-bancos/pre-libro-bancos-save.service';
import { PreLibroBancosService } from './pre-libro-bancos/pre-libro-bancos.service';
import { ReportesTesoreriaController } from './reportes/reportes-tesoreria.controller';
import { ReportesTesoreriaService } from './reportes/reportes-tesoreria.service';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaLdService } from './tesoreria-ld.service';
import { TesoreriaService } from './tesoreria.service';
import { TransaccionesTesoreriaService } from './tesoreria-transacciones.service';

@Module({
    imports: [],
    controllers: [
        TesoreriaController,
        PreLibroBancosController,
        ChequesController,
        ReportesTesoreriaController,
    ],
    providers: [
        TesoreriaService,
        TesoreriaLdService,
        TransaccionesTesoreriaService,
        PreLibroBancosService,
        PreLibroBancosSaveService,
        PreLibroBancosConciliacionService,
        ChequesService,
        ReportesTesoreriaService,
        CoreService,
    ],
    exports: [TransaccionesTesoreriaService],
})
export class TesoreriaModule { }
