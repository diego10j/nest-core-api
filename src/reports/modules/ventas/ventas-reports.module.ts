import { Module } from '@nestjs/common';

import { FacturasRepController } from './facturas/facturas-rep.controller';
import { FacturasRepService } from './facturas/facturas-rep.service';

@Module({
    controllers: [FacturasRepController],
    providers: [FacturasRepService],
})
export class VentasReportsModule { }
