import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';

import { CreateProformaWebDto } from './dto/create-proforma-web.dto';
import { ProformasDto } from './dto/proformas.dto';
import { ProformasService } from './proformas.service';

@Controller('proformas')
export class ProformasController {
  constructor(private readonly service: ProformasService) { }

  @Get('getProformas')
  // @Auth()
  getProformas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProformasDto) {
    return this.service.getProformas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCabProforma')
  // @Auth()
  getCabProforma(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getCabProforma({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDetallesProforma')
  // @Auth()
  getDetallesProforma(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getDetallesProforma({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('createProformaWeb')
  saveCampania(@Body() dtoIn: CreateProformaWebDto) {
    return this.service.createProformaWeb({
      ...dtoIn,
    });
  }

  @Post('updateOpenSolicitud')
  // @Auth()
  updateOpenSolicitud(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeDto) {
    return this.service.updateOpenSolicitud(dtoIn.ide, headersParams.login);
  }


}
