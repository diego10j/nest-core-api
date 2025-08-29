import { Module } from '@nestjs/common';
import { ComprobatesInvReportsService } from './comprobantes/comprobates-rep.service';
import { ComprobatesInvReportsController } from './comprobantes/comprobates-rep.controller';

@Module({
  controllers: [ComprobatesInvReportsController],
  providers: [ ComprobatesInvReportsService],
  imports: [], 
})
export class InventarioReportsModule {}
