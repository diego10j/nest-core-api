import { Module } from '@nestjs/common';

import { ErrorsModule } from '../../errors/errors.module';
import { ProductosController } from './productos/productos.controller';
import { DataSourceService } from '../connection/datasource.service';
import { AuditService } from '../audit/audit.service';
import { ProductosService } from './productos/productos.service';
import { BodegasController } from './bodegas/bodegas.controller';
import { BodegasService } from './bodegas/bodegas.service';
import { ComprobantesInvController } from './comprobantes/comprobantes.controller';
import { ComprobantesInvService } from './comprobantes/comprobantes.service';
import { CoreService } from '../core.service';

@Module({
    imports: [ErrorsModule],
    controllers: [ProductosController, BodegasController, ComprobantesInvController],
    providers: [DataSourceService, ProductosService, AuditService, BodegasService, ComprobantesInvService, CoreService]
})
export class InventarioModule { }
