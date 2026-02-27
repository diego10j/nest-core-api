import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';

import { FormasPagoController } from './formas-pago/formas-pago.controller';
import { FormasPagoService } from './formas-pago/formas-pago.service';
import { PlanCuentasController } from './plan-cuentas/plan-cuentas.controller';
import { PlanCuentasService } from './plan-cuentas/plan-cuentas.service';

@Module({
  imports: [],
  controllers: [FormasPagoController, PlanCuentasController],
  providers: [AuditService, CoreService, FormasPagoService, PlanCuentasService],
})
export class ContabilidadModule { }
