import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { PuntoVentaService } from './punto-venta.service';
import { Auth } from 'src/core/auth';

@ApiTags('Ventas-PuntoVenta')
@Controller('ventas/punto-venta')
export class PuntoVentaController {
  constructor(private readonly service: PuntoVentaService) { }

  @Get('getTableQueryEstadosOrden')
  @ApiOperation({ summary: 'Consulta tabla de estados de órdenes de punto de venta' })
  @Auth()
  getTableQueryEstadosOrden(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getTableQueryEstadosOrden({
      ...headersParams,
      ...dtoIn,
    });
  }
}
