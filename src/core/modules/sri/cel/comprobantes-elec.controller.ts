import { Controller, Get, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ComprobantesElecService } from './comprobantes-elec.service';
import { ClaveAccesoDto } from './dto/clave-acceso.dto';

@Controller('sri/cel')
export class ComprobantesElecController {
  constructor(private readonly service: ComprobantesElecService) {}

  @Get('getComprobantePorClaveAcceso')
  // @Auth()
  getCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClaveAccesoDto) {
    return this.service.getComprobantePorClaveAcceso({
      ...headersParams,
      ...dtoIn,
    });
  }
}
