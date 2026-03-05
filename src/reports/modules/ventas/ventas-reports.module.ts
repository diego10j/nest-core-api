import { Module } from '@nestjs/common';
import { VentasModule } from 'src/core/modules/ventas/ventas.module';

import { FacturasRepController } from './facturas/facturas-rep.controller';
import { FacturasRepService } from './facturas/facturas-rep.service';

@Module({
    imports: [VentasModule],
    controllers: [FacturasRepController],
    providers: [FacturasRepService],
})
export class VentasReportsModule { }
