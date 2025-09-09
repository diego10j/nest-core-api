import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';

import { BodegasController } from './bodegas/bodegas.controller';
import { BodegasService } from './bodegas/bodegas.service';
import { ComprobantesInvController } from './comprobantes/comprobantes.controller';
import { ComprobantesInvService } from './comprobantes/comprobantes.service';
import { ConfigPreciosProductosService } from './productos/config-precios.service';
import { ProductosController } from './productos/productos.controller';
import { ProductosService } from './productos/productos.service';

@Module({
  imports: [],
  controllers: [ProductosController, BodegasController, ComprobantesInvController],
  providers: [
    ProductosService,
    AuditService,
    BodegasService,
    ComprobantesInvService,
    CoreService,
    ConfigPreciosProductosService,
  ],
})
export class InventarioModule {}
