import { Query, Controller, Get, Body, Post, Delete } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { GetFilesDto } from '../../sistema/files/dto/get-files.dto';

import { ConfigPreciosProductosService } from './config-precios.service';
import { CategoriasDto } from './dto/categorias.dto';
import { ClientesProductoDto } from './dto/clientes-producto.dto';
import { CopiarConfigPreciosVentaDto } from './dto/copiar-config-precios.dto';
import { GeneraConfigPreciosVentaDto } from './dto/genera-config-precio.dto';
import { GetCatalogoProductosDto } from './dto/get-catalogo-productos.dto';
import { GetConfigPrecioProductoDto } from './dto/get-config-precios.dto';
import { GetCostoProductoDto } from './dto/get-costo-producto.dto';
import { GetProductoDto } from './dto/get-productos.dto';
import { GetSaldoProductoDto } from './dto/get-saldo.dto';
import { IdProductoDto } from './dto/id-producto.dto';
import { PrecioVentaProductoDto } from './dto/precio-venta-producto.dto';
import { PreciosProductoDto } from './dto/precios-producto.dto';
import { SaveConfigPrecioDto } from './dto/save-config-precios.dto';
import { SaveProductoDto } from './dto/save-producto.dto';
import { TopClientesProductoDto } from './dto/top-clientes-producto.dto';
import { TrnProductoDto } from './dto/trn-producto.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { ProductosService } from './productos.service';

@ApiTags('Inventario-Productos')
@Controller('inventario/productos')
export class ProductosController {
  constructor(
    private readonly productos: ProductosService,
    private readonly configPrecios: ConfigPreciosProductosService,
  ) { }

  @Get('getProductoByUuid')
  @ApiOperation({ summary: 'Obtener producto por UUID' })
  // @Auth()
  getProductoByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.productos.getProductoByUuid({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductos')
  @ApiOperation({ summary: 'Listar productos activos con filtros y paginación' })
  // @Auth()
  getProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProductoDto) {
    return this.productos.getProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAllProductos')
  @ApiOperation({ summary: 'Listar todos los productos (activos e inactivos) con filtros' })
  // @Auth()
  getAllProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProductoDto) {
    return this.productos.getAllProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCatalogoProductos')
  @ApiOperation({ summary: 'Obtener catálogo de productos con precios e imágenes' })
  // @Auth()
  getCatalogoProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCatalogoProductosDto) {
    return this.productos.getCatalogoProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTagsProductos')
  @ApiOperation({ summary: 'Obtener tags distintos de todos los productos' })
  // @Auth()
  getTagsProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.productos.getTagsProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProducto')
  @ApiOperation({ summary: 'Obtener datos completos de un producto por UUID' })
  // @Auth()
  getProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.productos.getProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryCategorias')
  @ApiOperation({ summary: 'Obtener tabla de categorías de productos' })
  // @Auth()
  getTableQueryCategorias(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CategoriasDto) {
    return this.productos.getTableQueryCategorias({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTreeModelCategorias')
  @ApiOperation({ summary: 'Obtener árbol jerárquico de categorías de productos' })
  // @Auth()
  getTreeModelCategorias(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CategoriasDto) {
    return this.productos.getTreeModelCategorias({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('searchProducto')
  @ApiOperation({ summary: 'Buscar productos por código o nombre (autocomplete)' })
  // @Auth()
  searchProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
    return this.productos.searchProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTrnProducto')
  @ApiOperation({ summary: 'Obtener transacciones (movimientos) de un producto por período' })
  // @Auth()
  getTrnProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
    return this.productos.getTrnProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getKardexPrecioPromedio')
  @ApiOperation({ summary: 'Obtener kardex de precio promedio ponderado de un producto' })
  // @Auth()
  getKardexPrecioPromedio(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
    return this.productos.getKardexPrecioPromedio({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getComprasProducto')
  @ApiOperation({ summary: 'Listar compras de un producto por período' })
  // @Auth()
  getComprasProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
    return this.productos.getComprasProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasProducto')
  @ApiOperation({ summary: 'Listar ventas de un producto por período' })
  // @Auth()
  getVentasProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PreciosProductoDto) {
    return this.productos.getVentasProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasProductoUtilidad')
  @ApiOperation({ summary: 'Listar ventas de un producto con cálculo de utilidad por período' })
  // @Auth()
  getVentasProductoUtilidad(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PreciosProductoDto) {
    return this.productos.getVentasProductoUtilidad({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getUltimosPreciosCompras')
  @ApiOperation({ summary: 'Obtener historial de los últimos precios de compra de un producto' })
  // @Auth()
  getUltimosPreciosCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getUltimosPreciosCompras({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldo')
  @ApiOperation({ summary: 'Obtener saldo actual de un producto en inventario' })
  // @Auth()
  getSaldo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetSaldoProductoDto) {
    return this.productos.getSaldo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldoPorBodega')
  @ApiOperation({ summary: 'Obtener saldo de un producto desglosado por bodega' })
  // @Auth()
  getSaldoPorBodega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getSaldoPorBodega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getStockMenudeoProducto')
  @ApiOperation({ summary: 'Obtener stock de menudeo de un producto' })
  // @Auth()
  getStockMenudeoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getStockMenudeoProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasMensuales')
  @ApiOperation({ summary: 'Obtener ventas mensuales de un producto por año' })
  // @Auth()
  getVentasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.productos.getVentasMensuales({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSumatoriaTrnPeriodo')
  @ApiOperation({ summary: 'Obtener sumatoria de transacciones de un producto en un período' })
  // @Auth()
  getSumatoriaTrnPeriodo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.productos.getSumatoriaTrnPeriodo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProveedoresProducto')
  @ApiOperation({ summary: 'Listar proveedores que han suministrado un producto' })
  // @Auth()
  getProveedoresProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getProveedoresProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getClientes')
  @ApiOperation({ summary: 'Listar clientes que han comprado un producto' })
  // @Auth()
  getClientesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
    return this.productos.getClientesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopClientesProducto')
  @ApiOperation({ summary: 'Obtener top de clientes que más han comprado un producto' })
  // @Auth()
  getTopClientesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesProductoDto) {
    return this.productos.getTopClientesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('chartVariacionPreciosCompras')
  @ApiOperation({ summary: 'Obtener datos de variación histórica de precios de compra para gráfico' })
  // @Auth()
  charVariacionPreciosCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.chartVariacionPreciosCompras({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getActividades')
  @ApiOperation({ summary: 'Obtener actividades recientes de un producto' })
  // @Auth()
  getActividades(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getActividades({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveProducto')
  @ApiOperation({ summary: 'Crear o actualizar un producto' })
  // @Auth()
  saveProducto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveProductoDto) {
    return this.productos.saveProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  // =========================================CONFIGURACION DE PRECIOS

  @Get('getPrecioVentaProducto')
  @ApiOperation({ summary: 'Obtener precio de venta de un producto para un cliente' })
  // @Auth()
  getPrecioVentaProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PrecioVentaProductoDto) {
    return this.configPrecios.getPrecioVentaProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('generarConfigPreciosVenta')
  @ApiOperation({ summary: 'Generar configuración de precios de venta para un producto' })
  //@Auth()
  generarConfigPreciosVenta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GeneraConfigPreciosVentaDto) {
    return this.configPrecios.generarConfigPreciosVenta({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getConfigPreciosProducto')
  @ApiOperation({ summary: 'Obtener configuración de precios de venta de un producto' })
  // @Auth()
  getConfigPreciosProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetConfigPrecioProductoDto) {
    return this.configPrecios.getConfigPreciosProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveConfigPrecios')
  @ApiOperation({ summary: 'Guardar configuración de precios de venta para un producto' })
  // @Auth()
  saveConfigPrecios(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveConfigPrecioDto) {
    return this.configPrecios.saveConfigPrecios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('findConfigPreciosById')
  @ApiOperation({ summary: 'Buscar configuración de precios por ID' })
  // @Auth()
  findConfigPreciosById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.configPrecios.findConfigPreciosById({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Delete('deleteConfigPrecios')
  @ApiOperation({ summary: 'Eliminar configuraciones de precios por IDs' })
  // @Auth()
  deleteDetailCampaniaById(@AppHeaders() _headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
    return this.configPrecios.deleteConfigPrecios(dtoIn);
  }

  @Post('copiarConfigPrecios')
  @ApiOperation({ summary: 'Copiar configuración de precios de un producto a otros' })
  // @Auth()
  copiarConfigPrecios(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CopiarConfigPreciosVentaDto) {
    return this.configPrecios.copiarConfigPrecios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAllProductosConfigPrecios')
  @ApiOperation({ summary: 'Listar todos los productos con su configuración de precios' })
  // @Auth()
  getAllProductosConfigPrecios(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProductoDto) {
    return this.configPrecios.getAllProductosConfigPrecios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCostoProducto')
  @ApiOperation({ summary: 'Obtener costo actual de un producto en un período' })
  // @Auth()
  getCostoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCostoProductoDto) {
    return this.productos.getCostoProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getLotesProducto')
  @ApiOperation({ summary: 'Listar lotes registrados de un producto' })
  // @Auth()
  getLotesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getLotesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFilesProductos')
  @ApiOperation({ summary: 'Listar archivos adjuntos de un producto' })
  //@Auth()
  getFilesProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetFilesDto) {
    return this.productos.getFilesProductos({
      ...headersParams,
      ...dtoIn,
    });
  }


}
