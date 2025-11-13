import { Module } from '@nestjs/common';

import { ChartsModule } from './charts/charts.module';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { IntegrationModule } from './integration/integration.module';
import { AuditModule } from './modules/audit/audit.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { SistemaModule } from './modules/sistema/sistema.module';
import { SriModule } from './modules/sri/sri.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { VariablesController } from './variables/variables.controller';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ProformasModule } from './modules/proformas/proformas.module';
import { CuentasPorCobrarModule } from './modules/cuentas-por-cobrar/cuentas-por-cobrar.module';


@Module({
  imports: [
    AuditModule,
    WhatsappModule,
    ChartsModule,
    InventarioModule,
    SistemaModule,
    VentasModule,
    SriModule,
    IntegrationModule,
    ContabilidadModule,
    ProformasModule,
    CuentasPorCobrarModule,
  ],
  providers: [CoreService],

  controllers: [CoreController, VariablesController],
})
export class CoreModule { }
