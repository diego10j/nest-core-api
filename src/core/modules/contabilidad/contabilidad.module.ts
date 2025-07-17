import { Module } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { CoreService } from '../../core.service';
import { FormasPagoService } from './formas-pago/formas-pago.service';
import { FormasPagoController } from './formas-pago/formas-pago.controller';


@Module({
    imports: [],
     controllers: [FormasPagoController],
    providers: [ AuditService, CoreService, FormasPagoService]
})
export class ContabilidadModule { }
