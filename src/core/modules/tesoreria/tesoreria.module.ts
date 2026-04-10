import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaLdService } from './tesoreria-ld.service';
import { TesoreriaService } from './tesoreria.service';
import { TransaccionesTesoreriaService } from './tesoreria-transacciones.service';

@Module({
    imports: [],
    controllers: [TesoreriaController],
    providers: [TesoreriaService, TesoreriaLdService, TransaccionesTesoreriaService, CoreService],
    exports: [TransaccionesTesoreriaService],
})
export class TesoreriaModule { }
