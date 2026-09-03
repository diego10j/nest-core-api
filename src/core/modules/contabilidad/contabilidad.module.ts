import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { ComprobanteContabilidadController } from './comprobante-contabilidad/comprobante-contabilidad.controller';
import { ComprobanteContabilidadService } from './comprobante-contabilidad/comprobante-contabilidad.service';
import { ConfigAsientosController } from './config-asientos/config-asientos.controller';
import { ConfigAsientosService } from './config-asientos/config-asientos.service';
import { ConfigImpuestosController } from './config-impuestos/config-impuestos.controller';
import { ConfigImpuestosService } from './config-impuestos/config-impuestos.service';
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
  imports: [ConfigModule],
  controllers: [
    ContabilidadController,
    FormasPagoController,
    PlanCuentasController,
    ContabilidadBiController,
    FlujoEfectivoController,
    ComprobanteContabilidadController,
    ConfigImpuestosController,
    ConfigAsientosController,
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
    ConfigImpuestosService,
    ConfigAsientosService,
  ],
  exports: [ContabilidadService, ComprobanteContabilidadService, AsientosAutomaticosService],
})
export class ContabilidadModule { }
