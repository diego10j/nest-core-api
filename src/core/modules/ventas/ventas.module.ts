import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { WhatsappModule } from '../../whatsapp/whatsapp.module';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { AuditService } from '../audit/audit.service';
import { FilesModule } from '../sistema/files/files.module';
import { ComprobantesElecService } from '../sri/cel/comprobantes-elec.service';
import { EmisorService } from '../sri/cel/emisor.service';
import { SriFacturaService } from '../sri/cel/sri-factura.service';
import { SriModule } from '../sri/sri.module';

import { ClientesSaveService } from './clientes/clientes-save.service';
import { ClientesController } from './clientes/clientes.controller';
import { ClientesService } from './clientes/clientes.service';
import { VentasBiController } from './data-bi/ventas-bi.controller';
import { VentasBiService } from './data-bi/ventas-bi.service';
import { FacturasSaveService } from './facturas/facturas-save.service';
import { FacturasController } from './facturas/facturas.controller';
import { FacturasService } from './facturas/facturas.service';
import { PosPuntoVentaSaveService } from './pos-punto-venta/pos-punto-venta-save.service';
import { PosPuntoVentaController } from './pos-punto-venta/pos-punto-venta.controller';
import { PosPuntoVentaService } from './pos-punto-venta/pos-punto-venta.service';
import { PuntoVentaController } from './punto-venta/punto-venta.controller';
import { PuntoVentaService } from './punto-venta/punto-venta.service';
import { TransportesSaveService } from './transportes/transportes-save.service';
import { TransportesController } from './transportes/transportes.controller';
import { TransportesService } from './transportes/transportes.service';

@Module({
  imports: [WhatsappModule, SriModule, FilesModule],
  controllers: [
    ClientesController,
    FacturasController,
    PuntoVentaController,
    VentasBiController,
    PosPuntoVentaController,
    TransportesController,
  ],
  providers: [
    ClientesService,
    ClientesSaveService,
    AuditService,
    CoreService,
    FacturasService,
    FacturasSaveService,
    VentasBiService,
    PuntoVentaService,
    PosPuntoVentaService,
    PosPuntoVentaSaveService,
    TransportesService,
    TransportesSaveService,
    WhatsappService,
    SriFacturaService,
    ComprobantesElecService,
    EmisorService,
  ],
  exports: [FacturasService, FacturasSaveService],
})
export class VentasModule { }
