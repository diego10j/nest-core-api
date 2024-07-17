import { Body, Controller, Post } from '@nestjs/common';
import { CalendarioService } from './calendario.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';

@Controller('sistema/calendario')
export class CalendarioController {
  constructor(private readonly service: CalendarioService) {
  }

  @Post('getEventos')
  // @Auth()
  getEventos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getEventos(dtoIn);
  }

  @Post('createEvento')
  // @Auth()
  createEvento(
    @Body() dtoIn: CreateEventoDto
  ) {
    return this.service.createEvento(dtoIn);
  }

  @Post('updateEvento')
  // @Auth()
  updateEvento(
    @Body() dtoIn: UpdateEventoDto
  ) {
    return this.service.updateEvento(dtoIn);
  }

  @Post('deleteEvento')
  // @Auth()
  deleteEvento(
    @Body() dtoIn: UpdateEventoDto
  ) {
    return this.service.deleteEvento(dtoIn);
  }

}
