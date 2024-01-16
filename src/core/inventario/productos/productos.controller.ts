import { Body, Controller, Post } from '@nestjs/common';

import { ProductosService } from './productos.service';

import { ServiceDto } from '../../../common/dto/service.dto';
import { TrnProductoDto } from './dto/trn-producto.dto';
// import { Auth } from '../../../core/auth/decorators';
import { IdProductoDto } from './dto/id-producto.dto';

@Controller('productos')
export class ProductosController {
  constructor(private readonly service: ProductosService) { }


  @Post('getProductos')
  // @Auth()
  getProductos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getProductos();
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
    @Body() dtoIn: TrnProductoDto
  ) {
    return this.service.getVentasProducto(dtoIn);
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

}
