import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppHeaders } from '../../common/decorators/header-params.decorator';
import { HeaderParamsDto } from '../../common/dto/common-params.dto';
import { Auth } from '../auth';

import { ChartsService } from './charts.service';
import { RadialBarDto } from './dto/radial-bar.dto';

@ApiTags('Charts')
@Controller('charts')
export class ChartsController {
  constructor(private readonly service: ChartsService) { }

  @Post('radialBar')
  @ApiOperation({ summary: 'Generar datos para gráfico radialBar' })
  @Auth()
  radialBar(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RadialBarDto) {
    return this.service.radialBar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('pie')
  @ApiOperation({ summary: 'Generar datos para gráfico pie' })
  @Auth()
  pie(@Body() dtoIn: RadialBarDto, @AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.radialBar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('donut')
  @ApiOperation({ summary: 'Generar datos para gráfico donut' })
  @Auth()
  donut(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RadialBarDto) {
    return this.service.radialBar({
      ...headersParams,
      ...dtoIn,
    });
  }
}
