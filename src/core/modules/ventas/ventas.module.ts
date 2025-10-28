import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { WhatsappModule } from '../../whatsapp/whatsapp.module';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { AuditService } from '../audit/audit.service';

import { ClientesController } from './clientes/clientes.controller';
import { ClientesService } from './clientes/clientes.service';
import { VentasBiController } from './data-bi/ventas-bi.controller';
import { VentasBiService } from './data-bi/ventas-bi.service';
import { FacturasController } from './facturas/facturas.controller';
import { FacturasService } from './facturas/facturas.service';
import { PuntoVentaController } from './punto-venta/punto-venta.controller';
import { PuntoVentaService } from './punto-venta/punto-venta.service';

@Module({
  imports: [WhatsappModule],
  controllers: [ClientesController, FacturasController, PuntoVentaController, VentasBiController],
  providers: [
    ClientesService,
    AuditService,
    CoreService,
    FacturasService,
    VentasBiService,
    PuntoVentaService,
    WhatsappService,
  ],
})
export class VentasModule { }
