import { Module } from '@nestjs/common';

import { ChartsModule } from './charts/charts.module';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { IntegrationModule } from './integration/integration.module';
import { AuditModule } from './modules/audit/audit.module';
import { ComprasModule } from './modules/compras/compras.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { CuentasPorCobrarModule } from './modules/cuentas-por-cobrar/cuentas-por-cobrar.module';
import { CuentasPorPagarModule } from './modules/cuentas-por-pagar/cuentas-por-pagar.module';
import { ImportacionesModule } from './modules/importaciones/importaciones.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { ProformasModule } from './modules/proformas/proformas.module';
import { SistemaModule } from './modules/sistema/sistema.module';
import { SriModule } from './modules/sri/sri.module';
import { TesoreriaModule } from './modules/tesoreria/tesoreria.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { ModulosSistemaService } from './variables/modulos-sistema.service';
import { VariablesController } from './variables/variables.controller';
import { WhatsappModule } from './whatsapp/whatsapp.module';

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
    CuentasPorPagarModule,
    ComprasModule,
    TesoreriaModule,
    ImportacionesModule,
  ],
  providers: [CoreService, ModulosSistemaService],

  controllers: [CoreController, VariablesController],
})
export class CoreModule { }
