import { Module } from '@nestjs/common';
import { ContabilidadModule } from 'src/core/modules/contabilidad/contabilidad.module';
import { SriModule } from 'src/core/modules/sri/sri.module';

import { ContabilidadRepController } from './contabilidad-rep.controller';
import { ContabilidadRepService } from './contabilidad-rep.service';

@Module({
  imports: [ContabilidadModule, SriModule],
  controllers: [ContabilidadRepController],
  providers: [ContabilidadRepService],
})
export class ContabilidadReportsModule {}
