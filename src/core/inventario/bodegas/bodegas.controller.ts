import { Query, Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BodegasService } from './bodegas.service';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { MovimientosBodegaDto } from './dto/mov-bodega.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { StockProductosDto } from './dto/stock-productos.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';


@ApiTags('Inventario-Bodegas')
@Controller('inventario/bodegas')
export class BodegasController {
  constructor(private readonly service: BodegasService) { }

  @Get('getBodegas')
  // @Auth()
  getBodegas(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.service.getBodegas({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getBodega')
  // @Auth()
  getBodega(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: IdeDto
  ) {
    return this.service.getBodega({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getMovimientos')
  // @Auth()
  getMovimientos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: MovimientosInvDto
  ) {
    return this.service.getMovimientos({
      ...headersParams,
      ...dtoIn
    });
  }



  @Get('getMovimientosBodega')
  // @Auth()
  getMovimientosBodega(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: MovimientosBodegaDto
  ) {
    return this.service.getMovimientosBodega({
      ...headersParams,
      ...dtoIn
    });
  }



  @Get('getStockProductos')
  // @Auth()
  getStockProductos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: StockProductosDto
  ) {
    return this.service.getStockProductos({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getListDataBodegas')
  // @Auth()
  getListDataBodegas(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.service.getListDataBodegas({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('getListDataDetalleStock')
  // @Auth()
  getListDataDetalleStock(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.service.getListDataDetalleStock({
      ...headersParams,
      ...dtoIn
    });
  }


}
