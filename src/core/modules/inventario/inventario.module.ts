import { Module } from '@nestjs/common';

import { CoreService } from '../../core.service';
import { IntegrationModule } from '../../integration/integration.module';
import { AuditService } from '../audit/audit.service';

import { BodegasController } from './bodegas/bodegas.controller';
import { BodegasService } from './bodegas/bodegas.service';
import { CatalogosSaveService } from './catalogos/catalogos-save.service';
import { CatalogosController } from './catalogos/catalogos.controller';
import { CatalogosService } from './catalogos/catalogos.service';
import { FileTempService } from '../sistema/files/file-temp.service';
import { FilesService } from '../sistema/files/files.service';
import { CategoriasController } from './categorias/categorias.controller';
import { CategoriasService } from './categorias/categorias.service';
import { ComprobantesInvController } from './comprobantes/comprobantes.controller';
import { ComprobantesInvService } from './comprobantes/comprobantes.service';
import { InventarioBiController } from './data-bi/inventario-bi.controller';
import { InventarioBiService } from './data-bi/inventario-bi.service';
import { InventarioProductoBiService } from './data-bi/inventario-prod-bi.service';
import { EtiquetasSaveService } from './etiquetas/etiquetas-save.service';
import { EtiquetasController } from './etiquetas/etiquetas.controller';
import { EtiquetasService } from './etiquetas/etiquetas.service';
import { HtmlProductController } from './html-product/html-product.controller';
import { HtmlProductService } from './html-product/html-product.service';
import { MenudeoSaveService } from './menudeo/menudeo-save.service';
import { MenudeoController } from './menudeo/menudeo.controller';
import { MenudeoService } from './menudeo/menudeo.service';
import { ConfigPreciosProductosService } from './productos/config-precios.service';
import { ProductosController } from './productos/productos.controller';
import { ProductosService } from './productos/productos.service';

@Module({
  imports: [IntegrationModule],
  controllers: [ProductosController, BodegasController, ComprobantesInvController, InventarioBiController, MenudeoController, EtiquetasController, CatalogosController, HtmlProductController, CategoriasController],
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
    EtiquetasService,
    EtiquetasSaveService,
    CatalogosService,
    CatalogosSaveService,
    FilesService,
    FileTempService,
    HtmlProductService,
    CategoriasService,
  ],
})
export class InventarioModule { }
