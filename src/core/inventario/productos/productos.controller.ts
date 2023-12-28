import { Body, Controller, Post } from '@nestjs/common';

import { ProductosService } from './productos.service';

import { ServiceDto } from '../../../common/dto/service.dto';
import { TrnProductoDto } from './dto/trn-producto.dto';
// import { Auth } from '../../../core/auth/decorators';

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

}
