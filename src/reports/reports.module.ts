import { Module } from '@nestjs/common';

import { CommonRepModule } from './common/common-rep.module';
import { InventarioReportsModule } from './modules/inventario/inventario-reports.module';
import { PrinterModule } from './printer/printer.module';

@Module({
  imports: [PrinterModule, CommonRepModule, InventarioReportsModule],
  providers: [],
  exports: [],
  controllers: [],
})
export class ReportsModule {}
