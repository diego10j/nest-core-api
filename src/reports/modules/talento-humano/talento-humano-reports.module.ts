import { Module } from '@nestjs/common';

import { NominaRepController } from './nomina-rep.controller';
import { NominaRepService } from './nomina-rep.service';

@Module({
    controllers: [NominaRepController],
    providers: [NominaRepService],
    exports: [NominaRepService],
})
export class TalentoHumanoReportsModule { }
