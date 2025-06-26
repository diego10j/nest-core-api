import { Query, Controller, Get, Body, Post, Delete } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

import { ProductosService } from './productos.service';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { TrnProductoDto } from './dto/trn-producto.dto';
// import { Auth } from '../../../core/auth/decorators';
import { IdProductoDto } from './dto/id-producto.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { PreciosProductoDto } from './dto/precios-producto.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';
import { ClientesProductoDto } from './dto/clientes-producto.dto';
import { CategoriasDto } from './dto/categorias.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { PrecioVentaProductoDto } from './dto/precio-venta-producto.dto';
import { GeneraConfigPreciosVentaDto } from './dto/genera-config-precio.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { GetSaldoProductoDto } from './dto/get-saldo.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { GetConfigPrecioProductoDto } from './dto/get-config-precios.dto';
import { SaveConfigPrecioDto } from './dto/save-config-precios.dto';
import { ConfigPreciosProductosService } from './config-precios.service';
import { CopiarConfigPreciosVentaDto } from './dto/copiar-config-precios.dto';



@ApiTags('Inventario-Productos')
@Controller('inventario/productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService,
    private readonly configPrecios: ConfigPreciosProductosService) { }



  @Get('getProductoByUuid')
  // @Auth()
  getProductoByUuid(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: UuidDto
  ) {
    return this.productos.getProductoByUuid({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getProductos')
  // @Auth()
  getProductos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.productos.getProductos({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getAllProductos')
  // @Auth()
  getAllProductos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.productos.getAllProductos({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getCatalogoProductos')
  // @Auth()
  getCatalogoProductos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.productos.getCatalogoProductos({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getProducto')
  // @Auth()
  getProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: UuidDto
  ) {
    return this.productos.getProducto({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTableQueryCategorias')
  // @Auth()
  getTableQueryCategorias(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CategoriasDto
  ) {
    return this.productos.getTableQueryCategorias({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTreeModelCategorias')
  // @Auth()
  getTreeModelCategorias(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CategoriasDto
  ) {
    return this.productos.getTreeModelCategorias({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('searchProducto')
  // @Auth()
  searchProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: SearchDto
  ) {
    return this.productos.searchProducto({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getTrnProducto')
  // @Auth()
  getTrnProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: TrnProductoDto
  ) {
    return this.productos.getTrnProducto({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getComprasProducto')
  // @Auth()
  getComprasProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: TrnProductoDto
  ) {
    return this.productos.getComprasProducto({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getVentasProducto')
  // @Auth()
  getVentasProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PreciosProductoDto
  ) {
    return this.productos.getVentasProducto({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getVentasProductoUtilidad')
  // @Auth()
  getVentasProductoUtilidad(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PreciosProductoDto
  ) {
    return this.productos.getVentasProductoUtilidad({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getUltimosPreciosCompras')
  // @Auth()
  getUltimosPreciosCompras(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdProductoDto
  ) {
    return this.productos.getUltimosPreciosCompras({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getSaldo')
  // @Auth()
  getSaldo(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetSaldoProductoDto
  ) {
    return this.productos.getSaldo({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getSaldoPorBodega')
  // @Auth()
  getSaldoPorBodega(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdProductoDto
  ) {
    return this.productos.getSaldoPorBodega({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getVentasMensuales')
  // @Auth()
  getVentasMensuales(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.getVentasMensuales({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getComprasMensuales')
  // @Auth()
  getComprasMensuales(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.getComprasMensuales({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getSumatoriaTrnPeriodo')
  // @Auth()
  getSumatoriaTrnPeriodo(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.getSumatoriaTrnPeriodo({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getProveedores')
  // @Auth()
  getProveedores(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdProductoDto
  ) {
    return this.productos.getProveedores({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTopProveedores')
  // @Auth()
  getTopProveedores(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.getTopProveedores({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getClientes')
  // @Auth()
  getClientes(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: ClientesProductoDto
  ) {
    return this.productos.getClientes({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTopClientes')
  // @Auth()
  getTopClientes(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.getTopClientes({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('chartVariacionPreciosCompras')
  // @Auth()
  charVariacionPreciosCompras(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdProductoDto
  ) {
    return this.productos.chartVariacionPreciosCompras({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getVariacionInventario')
  // @Auth()
  getVariacionInventario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.getVariacionInventario({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getActividades')
  // @Auth()
  getActividades(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdProductoDto
  ) {
    return this.productos.getActividades({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getProformasMensuales')
  // @Auth()
  getProformasMensuales(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.getProformasMensuales({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('chartVentasPeriodo')
  // @Auth()
  chartVentasPeriodo(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: VentasMensualesDto
  ) {
    return this.productos.chartVentasPeriodo({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getTopProductosVendidos')
  // @Auth()
  getTopProductosVendidos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.productos.getTopProductosVendidos({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getTopProductosFacturados')
  // @Auth()
  getTopProductosFacturados(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.productos.getTopProductosFacturados({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('chartProductos')
  // @Auth()
  chartProductos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.productos.chartProductos({
      ...headersParams,
      ...dtoIn
    });
  }

  // =========================================CONFIGURACION DE PRECIOS

  @Get('getPrecioVentaProducto')
  // @Auth()
  getPrecioVentaProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PrecioVentaProductoDto
  ) {
    return this.configPrecios.getPrecioVentaProducto({
      ...headersParams,
      ...dtoIn
    });
  }


  @Post('generarConfigPreciosVenta')
  //@Auth()
  generarConfigPreciosVenta(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: GeneraConfigPreciosVentaDto
  ) {
    return this.configPrecios.generarConfigPreciosVenta({
      ...headersParams,
      ...dtoIn
    });
  }



  @Get('getConfigPreciosProducto')
  // @Auth()
  getConfigPreciosProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetConfigPrecioProductoDto
  ) {
    return this.configPrecios.getConfigPreciosProducto({
      ...headersParams,
      ...dtoIn
    });
  }


  @Post('saveConfigPrecios')
  // @Auth()
  saveConfigPrecios(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: SaveConfigPrecioDto
  ) {
    return this.configPrecios.saveConfigPrecios({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('findConfigPreciosById')
  // @Auth()
  findConfigPreciosById(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdeDto
  ) {
    return this.configPrecios.findConfigPreciosById({
      ...headersParams,
      ...dtoIn
    });
  }

  @Delete('deleteConfigPrecios')
  // @Auth()
  deleteDetailCampaniaById(
    @AppHeaders() _headersParams: HeaderParamsDto,
    @Body() dtoIn: ArrayIdeDto
  ) {
    return this.configPrecios.deleteConfigPrecios(dtoIn);
  }


  @Post('copiarConfigPrecios')
  // @Auth()
  copiarConfigPrecios(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: CopiarConfigPreciosVentaDto
  ) {
    return this.configPrecios.copiarConfigPrecios({
      ...headersParams,
      ...dtoIn
    });
  }

}
