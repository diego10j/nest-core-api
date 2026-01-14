import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';

import { ProformasBiController } from './data-bi/proformas-bi.controller';
import { ProformasBiService } from './data-bi/proformas-bi.service';
import { ProformasController } from './proformas.controller';
import { ProformasService } from './proformas.service';

@Module({
  imports: [],
  controllers: [ProformasController, ProformasBiController],
  providers: [ProformasService, ProformasBiService, CoreService],
})
export class ProformasModule {}
