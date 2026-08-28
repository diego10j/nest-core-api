import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoreService } from '../../core.service';
import { IntegrationModule } from '../../integration/integration.module';
import { WhatsappModule } from '../../whatsapp/whatsapp.module';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { AuditService } from '../audit/audit.service';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { FilesModule } from '../sistema/files/files.module';
import { SriModule } from '../sri/sri.module';

import { ClientesSaveService } from './clientes/clientes-save.service';
import { ClientesController } from './clientes/clientes.controller';
import { ClientesService } from './clientes/clientes.service';
import { VentasBiController } from './data-bi/ventas-bi.controller';
import { VentasBiService } from './data-bi/ventas-bi.service';
import { FacturasSaveService } from './facturas/facturas-save.service';
import { FacturasController } from './facturas/facturas.controller';
import { FacturasService } from './facturas/facturas.service';
import { RetencionVentaSaveService } from './facturas/retencion-venta-save.service';
import { RetencionVentaXmlService } from './facturas/retencion-venta-xml.service';
import { RetencionVentaController } from './facturas/retencion-venta.controller';
import { NotasCreditoSaveService } from './notas-credito/notas-credito-save.service';
import { NotasCreditoController } from './notas-credito/notas-credito.controller';
import { NotasCreditoService } from './notas-credito/notas-credito.service';
import { PosPuntoVentaSaveService } from './pos-punto-venta/pos-punto-venta-save.service';
import { PosPuntoVentaController } from './pos-punto-venta/pos-punto-venta.controller';
import { PosPuntoVentaService } from './pos-punto-venta/pos-punto-venta.service';
import { PuntoVentaController } from './punto-venta/punto-venta.controller';
import { PuntoVentaService } from './punto-venta/punto-venta.service';
import { TransportesBiController } from './transportes/data-bi/transportes-bi.controller';
import { TransportesBiService } from './transportes/data-bi/transportes-bi.service';
import { TransportesSaveService } from './transportes/transportes-save.service';
import { TransportesController } from './transportes/transportes.controller';
import { TransportesService } from './transportes/transportes.service';

@Module({
  imports: [ConfigModule, WhatsappModule, SriModule, FilesModule, ContabilidadModule, IntegrationModule],
  controllers: [
    ClientesController,
    FacturasController,
    PuntoVentaController,
    VentasBiController,
    PosPuntoVentaController,
    TransportesController,
    TransportesBiController,
    NotasCreditoController,
    RetencionVentaController,
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
    TransportesBiService,
    WhatsappService,
    NotasCreditoSaveService,
    NotasCreditoService,
    RetencionVentaXmlService,
    RetencionVentaSaveService,
  ],
  exports: [FacturasService, FacturasSaveService],
})
export class VentasModule { }
