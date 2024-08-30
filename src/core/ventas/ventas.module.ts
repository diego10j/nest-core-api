import { Module } from '@nestjs/common';

import { ErrorsModule } from '../../errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';
import { AuditService } from '../audit/audit.service';
import { CoreService } from '../core.service';
import { ClientesController } from './clientes/clientes.controller';
import { ClientesService } from './clientes/clientes.service';
import { FacturasController } from './facturas/facturas.controller';
import { FacturasService } from './facturas/facturas.service';

@Module({
    imports: [ErrorsModule],
    controllers: [ClientesController, FacturasController],
    providers: [DataSourceService, ClientesService, AuditService, CoreService, FacturasService]
})
export class VentasModule { }
