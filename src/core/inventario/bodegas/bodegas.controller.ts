import { Body, Controller, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { BodegasService } from './bodegas.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { MovimientosBodegaDto } from './dto/mov-bodega.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { StockProductosDto } from './dto/stock-productos.dto';

@ApiTags('Inventario-Bodegas')
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

  @Post('getBodega')
  // @Auth()
  getBodega(
    @Body() dtoIn: IdeDto
  ) {
    return this.service.getBodega(dtoIn);
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


  @Post('getStockProductos')
  // @Auth()
  getStockProductos(
    @Body() dtoIn: StockProductosDto
  ) {
    return this.service.getStockProductos(dtoIn);
  }


  @Post('getListDataBodegas')
  // @Auth()
  getListDataBodegas(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataBodegas(dtoIn);
  }

  @Post('getListDataDetalleStock')
  // @Auth()
  getListDataDetalleStock(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataDetalleStock(dtoIn);
  }


}
