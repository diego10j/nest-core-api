import { Module } from '@nestjs/common';

import { CoreService } from '../../../core.service';

import { GeneralLdService } from './general-ld.service';
import { GeneralController } from './general.controller';
import { GeneralService } from './general.service';

@Module({
  imports: [],
  controllers: [GeneralController],
  providers: [GeneralService, GeneralLdService, CoreService],
})
export class GeneralModule {}
