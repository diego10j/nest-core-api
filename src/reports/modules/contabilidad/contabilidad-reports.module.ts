import { Module } from '@nestjs/common';
import { ContabilidadModule } from 'src/core/modules/contabilidad/contabilidad.module';

import { ContabilidadRepController } from './contabilidad-rep.controller';
import { ContabilidadRepService } from './contabilidad-rep.service';

@Module({
  imports: [ContabilidadModule],
  controllers: [ContabilidadRepController],
  providers: [ContabilidadRepService],
})
export class ContabilidadReportsModule {}
