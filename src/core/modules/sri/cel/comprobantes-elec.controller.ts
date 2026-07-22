import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ComprobantesElecService } from './comprobantes-elec.service';
import { ClaveAccesoDto } from './dto/clave-acceso.dto';
import { Auth } from 'src/core/auth';

@ApiTags('SRI-ComprobantesElec')
@Controller('sri/cel')
export class ComprobantesElecController {
  constructor(private readonly service: ComprobantesElecService) { }

  @Get('getComprobantePorClaveAcceso')
  @ApiOperation({ summary: 'Consultar comprobante electrónico en el SRI por clave de acceso' })
  @Auth()
  getCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClaveAccesoDto) {
    return this.service.getComprobantePorClaveAcceso({
      ...headersParams,
      ...dtoIn,
    });
  }
}
