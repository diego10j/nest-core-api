import { Query, Controller, Get, Body, Post } from '@nestjs/common';
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
import { BusquedaPorNombreDto } from './dto/buscar-nombre.dto';
import { CategoriasDto } from './dto/categorias.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { PrecioVentaProductoDto } from './dto/precio-venta-producto.dto';
import { GeneraConfigPreciosVentaDto } from './dto/genera-config-precio.dto';
import { IdeDto } from 'src/common/dto/ide.dto';



@ApiTags('Inventario-Productos')
@Controller('inventario/productos')
export class ProductosController {
  constructor(private readonly service: ProductosService) { }



  @Get('getProductoByUuid')
  // @Auth()
  getProductoByUuid(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: UuidDto
  ) {
    return this.service.getProductoByUuid({
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
    return this.service.getProductos({
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
    return this.service.getCatalogoProductos({
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
    return this.service.getProducto({
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
    return this.service.getTableQueryCategorias({
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
    return this.service.getTreeModelCategorias({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getProductosPorNombre')
  // @Auth()
  getProductosPorNombre(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: BusquedaPorNombreDto
  ) {
    return this.service.getProductosPorNombre({
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
    return this.service.getTrnProducto({
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
    return this.service.getComprasProducto({
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
    return this.service.getVentasProducto({
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
    return this.service.getVentasProductoUtilidad({
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
    return this.service.getUltimosPreciosCompras({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getSaldo')
  // @Auth()
  getSaldo(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdProductoDto
  ) {
    return this.service.getSaldo({
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
    return this.service.getSaldoPorBodega({
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
    return this.service.getVentasMensuales({
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
    return this.service.getComprasMensuales({
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
    return this.service.getSumatoriaTrnPeriodo({
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
    return this.service.getProveedores({
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
    return this.service.getTopProveedores({
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
    return this.service.getClientes({
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
    return this.service.getTopClientes({
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
    return this.service.chartVariacionPreciosCompras({
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
    return this.service.getVariacionInventario({
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
    return this.service.getActividades({
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
    return this.service.getProformasMensuales({
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
    return this.service.chartVentasPeriodo({
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
    return this.service.getTopProductosVendidos({
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
    return this.service.getTopProductosFacturados({
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
    return this.service.chartProductos({
      ...headersParams,
      ...dtoIn
    });
  }



  @Get('getPrecioVentaProducto')
  // @Auth()
  getPrecioVentaProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PrecioVentaProductoDto
  ) {
    return this.service.getPrecioVentaProducto({
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
    return this.service.generarConfigPreciosVenta({
      ...headersParams,
      ...dtoIn
    });
  }



  @Get('getConfigPreciosProducto')
  // @Auth()
  getConfigPreciosProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdeDto
  ) {
    return this.service.getConfigPreciosProducto({
      ...headersParams,
      ...dtoIn
    });
  }
  



}
