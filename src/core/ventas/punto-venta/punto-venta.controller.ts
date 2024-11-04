import { Body, Controller, Post } from '@nestjs/common';
import { PuntoVentaService } from './punto-venta.service';
import { ServiceDto } from 'src/common/dto/service.dto';

@Controller('ventas/punto-venta')
export class PuntoVentaController {
  constructor(private readonly service: PuntoVentaService) { }


  @Post('getTableQueryEstadosOrden')
  // @Auth()
  getTableQueryEstadosOrden(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getTableQueryEstadosOrden(dtoIn);
  }

}


