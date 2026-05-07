import { Module } from '@nestjs/common';
import { CommonRepModule } from './common/common-rep.module';
import { ContabilidadReportsModule } from './modules/contabilidad/contabilidad-reports.module';
import { InventarioReportsModule } from './modules/inventario/inventario-reports.module';
import { ProformasReportsModule } from './modules/proformas/proformas-reports.module';
import { VentasReportsModule } from './modules/ventas/ventas-reports.module';
import { PrinterModule } from './printer/printer.module';

@Module({
  imports: [PrinterModule, CommonRepModule, InventarioReportsModule, VentasReportsModule, ProformasReportsModule, ContabilidadReportsModule],
  providers: [],
  exports: [],
  controllers: [],
})
export class ReportsModule {}
