import { Module } from '@nestjs/common';
import { ProformasModule } from 'src/core/modules/proformas/proformas.module';

import { ProformasRepController } from './proformas-rep.controller';
import { ProformasRepService } from './proformas-rep.service';

@Module({
    imports: [ProformasModule],
    controllers: [ProformasRepController],
    providers: [ProformasRepService],
})
export class ProformasReportsModule { }