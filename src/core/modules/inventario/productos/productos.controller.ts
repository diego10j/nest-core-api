import { Query, Controller, Get, Body, Post, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { ConfigPreciosProductosService } from './config-precios.service';
import { CategoriasDto } from './dto/categorias.dto';
import { ClientesProductoDto } from './dto/clientes-producto.dto';
import { CopiarConfigPreciosVentaDto } from './dto/copiar-config-precios.dto';
import { GeneraConfigPreciosVentaDto } from './dto/genera-config-precio.dto';
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
  // @Auth()
  getProductoByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.productos.getProductoByUuid({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductos')
  // @Auth()
  getProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProductoDto) {
    return this.productos.getProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAllProductos')
  // @Auth()
  getAllProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProductoDto) {
    return this.productos.getAllProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCatalogoProductos')
  // @Auth()
  getCatalogoProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.productos.getCatalogoProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProducto')
  // @Auth()
  getProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.productos.getProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryCategorias')
  // @Auth()
  getTableQueryCategorias(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CategoriasDto) {
    return this.productos.getTableQueryCategorias({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTreeModelCategorias')
  // @Auth()
  getTreeModelCategorias(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CategoriasDto) {
    return this.productos.getTreeModelCategorias({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('searchProducto')
  // @Auth()
  searchProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
    return this.productos.searchProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTrnProducto')
  // @Auth()
  getTrnProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
    return this.productos.getTrnProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getComprasProducto')
  // @Auth()
  getComprasProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
    return this.productos.getComprasProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasProducto')
  // @Auth()
  getVentasProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PreciosProductoDto) {
    return this.productos.getVentasProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasProductoUtilidad')
  // @Auth()
  getVentasProductoUtilidad(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PreciosProductoDto) {
    return this.productos.getVentasProductoUtilidad({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getUltimosPreciosCompras')
  // @Auth()
  getUltimosPreciosCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getUltimosPreciosCompras({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldo')
  // @Auth()
  getSaldo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetSaldoProductoDto) {
    return this.productos.getSaldo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldoPorBodega')
  // @Auth()
  getSaldoPorBodega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getSaldoPorBodega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasMensuales')
  // @Auth()
  getVentasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.productos.getVentasMensuales({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSumatoriaTrnPeriodo')
  // @Auth()
  getSumatoriaTrnPeriodo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.productos.getSumatoriaTrnPeriodo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProveedoresProducto')
  // @Auth()
  getProveedoresProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getProveedoresProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getClientes')
  // @Auth()
  getClientesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
    return this.productos.getClientesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopClientesProducto')
  // @Auth()
  getTopClientesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesProductoDto) {
    return this.productos.getTopClientesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('chartVariacionPreciosCompras')
  // @Auth()
  charVariacionPreciosCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.chartVariacionPreciosCompras({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getActividades')
  // @Auth()
  getActividades(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getActividades({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveProducto')
  // @Auth()
  saveProducto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveProductoDto) {
    return this.productos.saveProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  // =========================================CONFIGURACION DE PRECIOS

  @Get('getPrecioVentaProducto')
  // @Auth()
  getPrecioVentaProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PrecioVentaProductoDto) {
    return this.configPrecios.getPrecioVentaProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('generarConfigPreciosVenta')
  //@Auth()
  generarConfigPreciosVenta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GeneraConfigPreciosVentaDto) {
    return this.configPrecios.generarConfigPreciosVenta({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getConfigPreciosProducto')
  // @Auth()
  getConfigPreciosProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetConfigPrecioProductoDto) {
    return this.configPrecios.getConfigPreciosProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveConfigPrecios')
  // @Auth()
  saveConfigPrecios(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveConfigPrecioDto) {
    return this.configPrecios.saveConfigPrecios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('findConfigPreciosById')
  // @Auth()
  findConfigPreciosById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.configPrecios.findConfigPreciosById({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Delete('deleteConfigPrecios')
  // @Auth()
  deleteDetailCampaniaById(@AppHeaders() _headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
    return this.configPrecios.deleteConfigPrecios(dtoIn);
  }

  @Post('copiarConfigPrecios')
  // @Auth()
  copiarConfigPrecios(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CopiarConfigPreciosVentaDto) {
    return this.configPrecios.copiarConfigPrecios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAllProductosConfigPrecios')
  // @Auth()
  getAllProductosConfigPrecios(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProductoDto) {
    return this.configPrecios.getAllProductosConfigPrecios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCostoProducto')
  // @Auth()
  getCostoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCostoProductoDto) {
    return this.productos.getCostoProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getLotesProducto')
  // @Auth()
  getLotesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.productos.getLotesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }



}
