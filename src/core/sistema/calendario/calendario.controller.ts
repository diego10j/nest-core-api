import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CalendarioService } from './calendario.service';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Controller('sistema/calendario')
export class CalendarioController {
  constructor(private readonly service: CalendarioService) {
  }

  @Get('getEventos')
  // @Auth()
  getEventos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.service.getEventos({
      ...headersParams,
      ...dtoIn
    });
  }

  @Post('createEvento')
  // @Auth()
  createEvento(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: CreateEventoDto
  ) {
    return this.service.createEvento({
      ...headersParams,
      ...dtoIn
    });
  }

  @Post('updateEvento')
  // @Auth()
  updateEvento(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: UpdateEventoDto
  ) {
    return this.service.updateEvento({
      ...headersParams,
      ...dtoIn
    });
  }

  @Post('deleteEvento')
  // @Auth()
  deleteEvento(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: UpdateEventoDto
  ) {
    return this.service.deleteEvento({
      ...headersParams,
      ...dtoIn
    });
  }

}
