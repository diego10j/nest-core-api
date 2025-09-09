import { Module } from '@nestjs/common';

import { ChartsController } from './charts.controller';
import { ChartsService } from './charts.service';

@Module({
  imports: [],
  controllers: [ChartsController],
  providers: [ChartsService],
})
export class ChartsModule {}
