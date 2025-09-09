import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { FirmaService } from './firma.service';

@Controller('sri/cel/firma')
export class FirmaController {
  constructor(private readonly service: FirmaService) {}

  @Get('getFirma')
  // @Auth()
  getCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getFirma({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFirmas')
  // @Auth()
  getFirmas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getFirmas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('clearCacheFirma')
  // @Auth()
  clearCacheFirma(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: QueryOptionsDto) {
    return this.service.clearCacheFirma({
      ...headersParams,
      ...dtoIn,
    });
  }
}
