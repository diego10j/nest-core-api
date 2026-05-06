import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { CalendarioService } from './calendario.service';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';

@ApiTags('Sistema-Calendario')
@Controller('sistema/calendario')
export class CalendarioController {
  constructor(private readonly service: CalendarioService) {}

  @Get('getEventos')
  @ApiOperation({ summary: 'Listar eventos del calendario' })
  // @Auth()
  getEventos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getEventos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('createEvento')
  @ApiOperation({ summary: 'Crear un nuevo evento en el calendario' })
  // @Auth()
  createEvento(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CreateEventoDto) {
    return this.service.createEvento({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updateEvento')
  @ApiOperation({ summary: 'Actualizar un evento del calendario' })
  // @Auth()
  updateEvento(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UpdateEventoDto) {
    return this.service.updateEvento({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('deleteEvento')
  @ApiOperation({ summary: 'Eliminar un evento del calendario' })
  // @Auth()
  deleteEvento(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UpdateEventoDto) {
    return this.service.deleteEvento({
      ...headersParams,
      ...dtoIn,
    });
  }
}
