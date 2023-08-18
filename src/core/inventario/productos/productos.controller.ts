import { Body, Controller, Post } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ServiceDto } from '../../../common/dto/service.dto';

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
}
