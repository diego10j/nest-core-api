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

@Module({
    imports: [ErrorsModule],
    controllers: [ClientesController, FacturasController, PuntoVentaController],
    providers: [DataSourceService, ClientesService, AuditService, CoreService, FacturasService, PuntoVentaService]
})
export class VentasModule { }
