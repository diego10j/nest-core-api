import { Query, Controller, Get } from '@nestjs/common';
import { ApiPersonaService } from './api-persona.service';
import { RucDto } from './dto/ruc.dto';
import { CedulaDto } from './dto/cedula.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';


@Controller('integration/api-persona')
export class ApiPersonaController {
  constructor(private readonly service: ApiPersonaService) { }

  @Get('consultaCedula')
  // @Auth()
  consultaCedula(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CedulaDto
  ) {
    return this.service.consultaCedula({
      ...headersParams,
      ...dtoIn
    });
  }

  @Get('consultaRUC')
  // @Auth()
  consultaRUC(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: RucDto
  ) {
    return this.service.consultaRUC({
      ...headersParams,
      ...dtoIn
    });
  }


}
