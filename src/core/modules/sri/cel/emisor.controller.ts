import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { Auth } from 'src/core/auth';

import { EmisorService } from './emisor.service';

@ApiTags('SRI-Emisor')
@Controller('sri/cel/emisor')
export class EmisorController {
  constructor(private readonly service: EmisorService) { }

  @Get('getEmisor')
  @ApiOperation({ summary: 'Obtener datos del emisor de comprobantes electrónicos' })
  @Auth()
  getEmisor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getEmisor({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('clearCacheEmisor')
  @ApiOperation({ summary: 'Limpiar caché de datos del emisor' })
  @Auth()
  clearCacheEmisor(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: QueryOptionsDto) {
    return this.service.clearCacheEmisor({
      ...headersParams,
      ...dtoIn,
    });
  }
}
