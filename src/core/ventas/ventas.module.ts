import { Module } from '@nestjs/common';

import { ErrorsModule } from '../../errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { AuditService } from '../audit/audit.service';
import { CoreService } from '../core.service';
import { ClientesController } from './clientes/clientes.controller';
import { ClientesService } from './clientes/clientes.service';
import { FacturasController } from './facturas/facturas.controller';
import { FacturasService } from './facturas/facturas.service';
import { PuntoVentaController } from './punto-venta/punto-venta.controller';
import { PuntoVentaService } from './punto-venta/punto-venta.service';
import { ProformasController } from './proformas/proformas.controller';
import { ProformasService } from './proformas/proformas.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
    imports: [ErrorsModule,WhatsappModule],
    controllers: [ClientesController, FacturasController, PuntoVentaController, ProformasController],
    providers: [DataSourceService, ClientesService, AuditService, CoreService, FacturasService, PuntoVentaService, ProformasService, WhatsappService]
})
export class VentasModule { }
