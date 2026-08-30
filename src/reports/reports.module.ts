import { Module } from '@nestjs/common';

import { CommonRepModule } from './common/common-rep.module';
import { ContabilidadReportsModule } from './modules/contabilidad/contabilidad-reports.module';
import { CuentasPorPagarReportsModule } from './modules/cuentas-por-pagar/cuentas-por-pagar-reports.module';
import { InventarioReportsModule } from './modules/inventario/inventario-reports.module';
import { ProformasReportsModule } from './modules/proformas/proformas-reports.module';
import { TalentoHumanoReportsModule } from './modules/talento-humano/talento-humano-reports.module';
import { VentasReportsModule } from './modules/ventas/ventas-reports.module';
import { PrinterModule } from './printer/printer.module';

@Module({
  imports: [
    PrinterModule,
    CommonRepModule,
    InventarioReportsModule,
    VentasReportsModule,
    ProformasReportsModule,
    ContabilidadReportsModule,
    CuentasPorPagarReportsModule,
    TalentoHumanoReportsModule,
  ],
  providers: [],
  exports: [],
  controllers: [],
})
export class ReportsModule {}
