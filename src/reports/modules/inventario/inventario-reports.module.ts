import { Module } from '@nestjs/common';

import { ComprobatesInvReportsController } from './comprobantes/comprobates-rep.controller';
import { ComprobatesInvReportsService } from './comprobantes/comprobates-rep.service';

@Module({
  controllers: [ComprobatesInvReportsController],
  providers: [ComprobatesInvReportsService],
})
export class InventarioReportsModule {}
