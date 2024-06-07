import { Body, Controller, Post } from '@nestjs/common';
import { CalendarioService } from './calendario.service';
import { ServiceDto } from '../../../common/dto/service.dto';

@Controller('calendario')
export class CalendarioController {
  constructor(private readonly service: CalendarioService) {
  }

  @Post('getEvents')
  // @Auth()
  getEvents(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getEvents(dtoIn);
  }

}
