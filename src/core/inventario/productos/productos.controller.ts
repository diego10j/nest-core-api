import { Body, Controller, Post } from '@nestjs/common';

import { ProductosService } from './productos.service';

import { ServiceDto } from '../../../common/dto/service.dto';
import { TrnProductoDto } from './dto/trn-producto.dto';
// import { Auth } from '../../../core/auth/decorators';
import { IdProductoDto } from './dto/id-producto.dto';
import { IVentasMensualesDto } from './dto/ventas-mensuales.dto';
import { PreciosProductoDto } from './dto/precios-producto.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';
import { ClientesProductoDto } from './dto/clientes-producto.dto';
@Controller('inventario/productos')
export class ProductosController {
  constructor(private readonly service: ProductosService) { }


  @Post('getProductos')
  // @Auth()
  getProductos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getProductos(dtoIn);
  }

  @Post('getProducto')
  // @Auth()
  getProducto(
    @Body() dtoIn: UuidDto
  ) {
    return this.service.getProducto(dtoIn);
  }

  @Post('getTrnProducto')
  // @Auth()
  getTrnProducto(
    @Body() dtoIn: TrnProductoDto
  ) {
    return this.service.getTrnProducto(dtoIn);
  }

  @Post('getComprasProducto')
  // @Auth()
  getComprasProducto(
    @Body() dtoIn: TrnProductoDto
  ) {
    return this.service.getComprasProducto(dtoIn);
  }


  @Post('getVentasProducto')
  // @Auth()
  getVentasProducto(
    @Body() dtoIn: PreciosProductoDto
  ) {
    return this.service.getVentasProductoUtilidad(dtoIn);
  }


  @Post('getUltimosPreciosCompras')
  // @Auth()
  getUltimosPreciosCompras(
    @Body() dtoIn: IdProductoDto
  ) {
    return this.service.getUltimosPreciosCompras(dtoIn);
  }

  @Post('getSaldo')
  // @Auth()
  getSaldo(
    @Body() dtoIn: IdProductoDto
  ) {
    return this.service.getSaldo(dtoIn);
  }

  @Post('getSaldoPorBodega')
  // @Auth()
  getSaldoPorBodega(
    @Body() dtoIn: IdProductoDto
  ) {
    return this.service.getSaldoPorBodega(dtoIn);
  }


  @Post('getVentasMensuales')
  // @Auth()
  getVentasMensuales(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.getVentasMensuales(dtoIn);
  }

  @Post('getComprasMensuales')
  // @Auth()
  getComprasMensuales(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.getComprasMensuales(dtoIn);
  }


  @Post('getSumatoriaTrnPeriodo')
  // @Auth()
  getSumatoriaTrnPeriodo(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.getSumatoriaTrnPeriodo(dtoIn);
  }


  @Post('getProveedores')
  // @Auth()
  getProveedores(
    @Body() dtoIn: IdProductoDto
  ) {
    return this.service.getProveedores(dtoIn);
  }

  @Post('getTopProveedores')
  // @Auth()
  getTopProveedores(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.getTopProveedores(dtoIn);
  }

  @Post('getClientes')
  // @Auth()
  getClientes(
    @Body() dtoIn: ClientesProductoDto
  ) {
    return this.service.getClientes(dtoIn);
  }

  @Post('getTopClientes')
  // @Auth()
  getTopClientes(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.getTopClientes(dtoIn);
  }

  @Post('chartVariacionPreciosCompras')
  // @Auth()
  charVariacionPreciosCompras(
    @Body() dtoIn: IdProductoDto
  ) {
    return this.service.chartVariacionPreciosCompras(dtoIn);
  }

  @Post('getVariacionInventario')
  // @Auth()
  getVariacionInventario(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.getVariacionInventario(dtoIn);
  }


  @Post('getActividades')
  // @Auth()
  getActividades(
    @Body() dtoIn: IdProductoDto
  ) {
    return this.service.getActividades(dtoIn);
  }


  @Post('getProformasMensuales')
  // @Auth()
  getProformasMensuales(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.getProformasMensuales(dtoIn);
  }

  @Post('chartVentasPeriodo')
  // @Auth()
  chartVentasPeriodo(
    @Body() dtoIn: IVentasMensualesDto
  ) {
    return this.service.chartVentasPeriodo(dtoIn);
  }


  @Post('getTopProductosVendidos')
  // @Auth()
  getTopProductosVendidos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getTopProductosVendidos(dtoIn);
  }

  @Post('getTopProductosFacturados')
  // @Auth()
  getTopProductosFacturados(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getTopProductosFacturados(dtoIn);
  }

  @Post('chartProductos')
  // @Auth()
  chartProductos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.chartProductos(dtoIn);
  }

}
