import { Body, Controller, Post } from '@nestjs/common';
import { BodegasService } from './bodegas.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { MovimientosBodegaDto } from './dto/mov-bodega.dto';

@Controller('inventario/bodegas')
export class BodegasController {
  constructor(private readonly service: BodegasService) { }

  @Post('getBodegas')
  // @Auth()
  getBodegas(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getBodegas(dtoIn);
  }

  @Post('getMovimientos')
  // @Auth()
  getMovimientos(
    @Body() dtoIn: MovimientosInvDto
  ) {
    return this.service.getMovimientos(dtoIn);
  }

  @Post('getMovimientosBodega')
  // @Auth()
  getMovimientosBodega(
    @Body() dtoIn: MovimientosBodegaDto
  ) {
    return this.service.getMovimientosBodega(dtoIn);
  }


}
