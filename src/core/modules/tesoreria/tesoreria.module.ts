import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { IntegrationModule } from 'src/core/integration/integration.module';

import { BancosController } from './bancos/bancos.controller';
import { BancosSaveService } from './bancos/bancos-save.service';
import { BancosService } from './bancos/bancos.service';
import { CajasController } from './cajas/cajas.controller';
import { CajasSaveService } from './cajas/cajas-save.service';
import { CajasService } from './cajas/cajas.service';
import { ChequesController } from './cheques/cheques.controller';
import { ChequesService } from './cheques/cheques.service';
import { PreLibroBancosConciliacionService } from './pre-libro-bancos/pre-libro-bancos-conciliacion.service';
import { PreLibroBancosSaveService } from './pre-libro-bancos/pre-libro-bancos-save.service';
import { PreLibroBancosController } from './pre-libro-bancos/pre-libro-bancos.controller';
import { PreLibroBancosService } from './pre-libro-bancos/pre-libro-bancos.service';
import { ReportesTesoreriaController } from './reportes/reportes-tesoreria.controller';
import { ReportesTesoreriaService } from './reportes/reportes-tesoreria.service';
import { TesoreriaLdService } from './tesoreria-ld.service';
import { TransaccionesTesoreriaService } from './tesoreria-transacciones.service';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaService } from './tesoreria.service';

@Module({
    imports: [IntegrationModule],
    controllers: [
        TesoreriaController,
        PreLibroBancosController,
        ChequesController,
        ReportesTesoreriaController,
        BancosController,
        CajasController,
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
        BancosService,
        BancosSaveService,
        CajasService,
        CajasSaveService,
        CoreService,
    ],
    exports: [TransaccionesTesoreriaService],
})
export class TesoreriaModule { }
