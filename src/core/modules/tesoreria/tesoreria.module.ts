import { Module } from '@nestjs/common';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaLdService } from './tesoreria-ld.service';
import { TesoreriaService } from './tesoreria.service';

@Module({
    imports: [],
    controllers: [TesoreriaController],
    providers: [TesoreriaService, TesoreriaLdService],
})
export class TesoreriaModule { }
