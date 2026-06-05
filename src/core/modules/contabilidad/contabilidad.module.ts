import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { ComprobanteContabilidadController } from './comprobante-contabilidad/comprobante-contabilidad.controller';
import { ComprobanteContabilidadService } from './comprobante-contabilidad/comprobante-contabilidad.service';
import { ContabilidadController } from './contabilidad.controller';
import { ContabilidadService } from './contabilidad.service';
import { ContabilidadBiController } from './data-bi/contabilidad-bi.controller';
import { ContabilidadBiService } from './data-bi/contabilidad-bi.service';
import { FlujoEfectivoController } from './flujo-efectivo/flujo-efectivo.controller';
import { FlujoEfectivoService } from './flujo-efectivo/flujo-efectivo.service';
import { FormasPagoController } from './formas-pago/formas-pago.controller';
import { FormasPagoService } from './formas-pago/formas-pago.service';
import { PlanCuentasController } from './plan-cuentas/plan-cuentas.controller';
import { PlanCuentasService } from './plan-cuentas/plan-cuentas.service';

@Module({
  imports: [],
  controllers: [
    ContabilidadController,
    FormasPagoController,
    PlanCuentasController,
    ContabilidadBiController,
    FlujoEfectivoController,
    ComprobanteContabilidadController,
  ],
  providers: [
    AuditService,
    CoreService,
    ContabilidadService,
    FormasPagoService,
    PlanCuentasService,
    ContabilidadBiService,
    FlujoEfectivoService,
    ComprobanteContabilidadService,
    AsientosAutomaticosService,
  ],
  exports: [ContabilidadService, ComprobanteContabilidadService, AsientosAutomaticosService],
})
export class ContabilidadModule { }
