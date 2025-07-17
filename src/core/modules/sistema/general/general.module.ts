import { Module } from '@nestjs/common';
import { GeneralService } from './general.service';
import { GeneralController } from './general.controller';
import { CoreService } from '../../../core.service';
import { GeneralLdService } from './general-ld.service';

@Module({
  imports: [],
  controllers: [GeneralController],
  providers: [GeneralService, GeneralLdService,  CoreService],
})
export class GeneralModule { }
