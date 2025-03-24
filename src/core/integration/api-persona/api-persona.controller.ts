import { Body, Controller, Post } from '@nestjs/common';
import { ApiPersonaService } from './api-persona.service';
import { RucDto } from '../dto/ruc.dto';
import { CedulaDto } from '../dto/cedula.dto';


@Controller('integration/api-persona')
export class ApiPersonaController {
  constructor(private readonly service: ApiPersonaService) { }

  @Post('consultaCedula')
  // @Auth()
  consultaCedula(
    @Body() dtoIn: CedulaDto
  ) {
    return this.service.consultaCedula(dtoIn);
  }

  @Post('consultaRUC')
  // @Auth()
  consultaRUC(
    @Body() dtoIn: RucDto
  ) {
    return this.service.consultaRUC(dtoIn);
  }


}
