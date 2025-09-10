import { Query, Controller, Get } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ApiPersonaService } from './api-persona.service';

import { RucDto } from 'src/core/modules/sistema/admin/dto/ruc.dto';
import { CedulaDto } from 'src/core/modules/sistema/general/dto/cedula.dto';

@Controller('integration/api-persona')
export class ApiPersonaController {
  constructor(private readonly service: ApiPersonaService) {}

  @Get('consultaCedula')
  // @Auth()
  consultaCedula(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CedulaDto) {
    return this.service.consultaCedula({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('consultaRUC')
  // @Auth()
  consultaRUC(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RucDto) {
    return this.service.consultaRUC({
      ...headersParams,
      ...dtoIn,
    });
  }
}
