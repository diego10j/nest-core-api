import { Module } from '@nestjs/common';

import { BodegaInvReportsController } from './bodega/bodega-rep.controller';
import { BodegaInvReportsService } from './bodega/bodega-rep.services';
import { ComprobatesInvReportsController } from './comprobantes/comprobates-rep.controller';
import { ComprobatesInvReportsService } from './comprobantes/comprobates-rep.service';

@Module({
  controllers: [ComprobatesInvReportsController, BodegaInvReportsController],
  providers: [ComprobatesInvReportsService, BodegaInvReportsService],
})
export class InventarioReportsModule { }
