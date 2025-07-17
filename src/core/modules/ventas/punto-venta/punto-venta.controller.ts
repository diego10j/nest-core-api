import { Controller, Get, Query } from '@nestjs/common';
import { PuntoVentaService } from './punto-venta.service';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';

@Controller('ventas/punto-venta')
export class PuntoVentaController {
  constructor(private readonly service: PuntoVentaService) { }


  @Get('getTableQueryEstadosOrden')
  // @Auth()
  getTableQueryEstadosOrden(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.service.getTableQueryEstadosOrden({
      ...headersParams,
      ...dtoIn
    });
  }

}


