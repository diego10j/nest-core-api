import { Module } from '@nestjs/common';
import { DataSourceService } from './connection/datasource.service';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { ErrorsModule } from '../errors/errors.module';

import { WhatsappModule } from './whatsapp/whatsapp.module';
import { SistemaModule } from './sistema/sistema.module';

import { InventarioModule } from './inventario/inventario.module';
import { VentasModule } from './ventas/ventas.module';
import { ChartsModule } from './charts/charts.module';
import { AuditModule } from './audit/audit.module';
import { GptModule } from './gpt/gpt.module';
import { SriModule } from './sri/sri.module';
import { IntegrationModule } from './integration/integration.module';
import { ContabilidadModule } from './contabilidad/contabilidad.module';
@Module({
  imports: [ErrorsModule, AuditModule, WhatsappModule, ChartsModule,
    InventarioModule, SistemaModule, VentasModule, GptModule, SriModule, IntegrationModule, ContabilidadModule],
  providers: [DataSourceService, CoreService],
  exports: [DataSourceService],
  controllers: [CoreController],
})
export class CoreModule { }