import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { ProformasController } from './proformas.controller';
import { ProformasService } from './proformas.service';



@Module({
  imports: [],
  controllers: [ProformasController],
  providers: [
    ProformasService,
    CoreService,
  ],
})
export class ProformasModule { }
