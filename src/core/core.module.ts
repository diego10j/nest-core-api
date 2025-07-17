import { Module } from '@nestjs/common';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';

import { WhatsappModule } from './whatsapp/whatsapp.module';
import { SistemaModule } from './modules/sistema/sistema.module';

import { InventarioModule } from './modules/inventario/inventario.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { ChartsModule } from './charts/charts.module';
import { AuditModule } from './modules/audit/audit.module';
import { SriModule } from './modules/sri/sri.module';
import { IntegrationModule } from './integration/integration.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { VariablesController } from './variables/variables.controller';

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
  ],
  providers: [
    CoreService,
  ],

  controllers: [CoreController, VariablesController],
})
export class CoreModule {}