import { Controller, Body, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RucDto } from 'src/core/modules/sistema/admin/dto/ruc.dto';
import { CedulaDto } from 'src/core/modules/sistema/general/dto/cedula.dto';

import { ApiPersonaService } from './api-persona.service';

@ApiTags('Integración-ApiPersona')
@Controller('integration/api-persona')
export class ApiPersonaController {
  constructor(private readonly service: ApiPersonaService) { }

  @Post('consultaCedula')
  @ApiOperation({ summary: 'Consultar datos de persona natural por número de cédula' })
  consultaCedula(@Body() dtoIn: CedulaDto) {
    return this.service.consultaCedula(dtoIn);
  }

  @Post('consultaRUC')
  @ApiOperation({ summary: 'Consultar datos de empresa o persona jurídica por número de RUC' })
  consultaRUC(@Body() dtoIn: RucDto) {
    return this.service.consultaRUC(dtoIn);
  }
}
