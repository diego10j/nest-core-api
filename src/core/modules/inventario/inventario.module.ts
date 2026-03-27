import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { AuditService } from '../audit/audit.service';

import { BodegasController } from './bodegas/bodegas.controller';
import { BodegasService } from './bodegas/bodegas.service';
import { ComprobantesInvController } from './comprobantes/comprobantes.controller';
import { ComprobantesInvService } from './comprobantes/comprobantes.service';
import { InventarioBiController } from './data-bi/inventario-bi.controller';
import { InventarioBiService } from './data-bi/inventario-bi.service';
import { InventarioProductoBiService } from './data-bi/inventario-prod-bi.service';
import { MenudeoController } from './menudeo/menudeo.controller';
import { MenudeoSaveService } from './menudeo/menudeo-save.service';
import { MenudeoService } from './menudeo/menudeo.service';
import { ConfigPreciosProductosService } from './productos/config-precios.service';
import { ProductosController } from './productos/productos.controller';
import { ProductosService } from './productos/productos.service';

@Module({
  imports: [],
  controllers: [ProductosController, BodegasController, ComprobantesInvController, InventarioBiController, MenudeoController],
  providers: [
    ProductosService,
    AuditService,
    BodegasService,
    ComprobantesInvService,
    CoreService,
    ConfigPreciosProductosService,
    InventarioBiService,
    InventarioProductoBiService,
    MenudeoService,
    MenudeoSaveService,
  ],
})
export class InventarioModule { }
