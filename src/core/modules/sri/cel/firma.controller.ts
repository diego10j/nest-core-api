import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { Auth } from 'src/core/auth';

import { FirmaService } from './firma.service';

@ApiTags('SRI-Firma')
@Controller('sri/cel/firma')
export class FirmaController {
  constructor(private readonly service: FirmaService) { }

  @Get('getFirma')
  @ApiOperation({ summary: 'Obtener datos de la firma electrónica activa' })
  @Auth()
  getCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getFirma({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFirmas')
  @ApiOperation({ summary: 'Listar todas las firmas electrónicas configuradas' })
  @Auth()
  getFirmas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getFirmas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('clearCacheFirma')
  @ApiOperation({ summary: 'Limpiar caché de datos de firma electrónica' })
  @Auth()
  clearCacheFirma(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: QueryOptionsDto) {
    return this.service.clearCacheFirma({
      ...headersParams,
      ...dtoIn,
    });
  }
}
