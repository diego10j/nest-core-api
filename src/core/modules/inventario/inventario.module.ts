import { Module } from '@nestjs/common';

import { ProductosController } from './productos/productos.controller';
import { AuditService } from '../audit/audit.service';
import { ProductosService } from './productos/productos.service';
import { BodegasController } from './bodegas/bodegas.controller';
import { BodegasService } from './bodegas/bodegas.service';
import { ComprobantesInvController } from './comprobantes/comprobantes.controller';
import { ComprobantesInvService } from './comprobantes/comprobantes.service';
import { CoreService } from '../../core.service';
import { ConfigPreciosProductosService } from './productos/config-precios.service';

@Module({
    imports: [],
    controllers: [ProductosController, BodegasController, ComprobantesInvController],
    providers: [ ProductosService, AuditService, BodegasService, ComprobantesInvService, CoreService,ConfigPreciosProductosService]
})
export class InventarioModule { }
