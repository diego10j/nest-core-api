import { Controller, Get, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { FormasPagoService } from './formas-pago.service';

@Controller('contabilidad/formas-pago')
export class FormasPagoController {
  constructor(private readonly service: FormasPagoService) {}

  @Get('getFormasPago')
  // @Auth()
  getFormasPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getFormasPago({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDetalleFormasPago')
  // @Auth()
  getDetalleFormasPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getDetalleFormasPago({
      ...headersParams,
      ...dtoIn,
    });
  }
}
