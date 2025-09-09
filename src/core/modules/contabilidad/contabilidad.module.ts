import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';

import { FormasPagoController } from './formas-pago/formas-pago.controller';
import { FormasPagoService } from './formas-pago/formas-pago.service';

@Module({
  imports: [],
  controllers: [FormasPagoController],
  providers: [AuditService, CoreService, FormasPagoService],
})
export class ContabilidadModule {}
