import { Module } from '@nestjs/common';
import { SriModule } from 'src/core/modules/sri/sri.module';
import { VentasModule } from 'src/core/modules/ventas/ventas.module';

import { FacturasRepController } from './facturas/facturas-rep.controller';
import { FacturasRepService } from './facturas/facturas-rep.service';
import { GuiasRemisionRepController } from './guias-remision/guias-remision-rep.controller';
import { GuiasRemisionRepService } from './guias-remision/guias-remision-rep.service';
import { NotasCreditoRepController } from './notas-credito/notas-credito-rep.controller';
import { NotasCreditoRepService } from './notas-credito/notas-credito-rep.service';

@Module({
    imports: [VentasModule, SriModule],
    controllers: [FacturasRepController, NotasCreditoRepController, GuiasRemisionRepController],
    providers: [FacturasRepService, NotasCreditoRepService, GuiasRemisionRepService],
    exports: [FacturasRepService, NotasCreditoRepService, GuiasRemisionRepService],
})
export class VentasReportsModule { }
