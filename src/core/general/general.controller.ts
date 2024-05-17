import { Body, Controller, Post } from '@nestjs/common';
import { GeneralService } from './general.service';
import { ServiceDto } from '../../common/dto/service.dto';

@Controller('general')
export class GeneralController {
  constructor(private readonly service: GeneralService) { }


  @Post('getListDataPeriodos')
  // @Auth()
  getListDataPeriodos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataPeriodos(dtoIn);
  }

}
