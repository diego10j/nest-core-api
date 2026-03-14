import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';

import { CreateProformaWebDto } from './dto/create-proforma-web.dto';
import { GetProformaDto } from './dto/get-proforma.dto';
import { ProformasDto } from './dto/proformas.dto';
import { SaveProformaDto } from './dto/save-proforma.dto';
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

  @Get('getProformaByID')
  // @Auth()
  getProformaByID(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProformaDto) {
    return this.service.getProformaByID({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveProforma')
  // @Auth()
  saveProforma(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveProformaDto) {
    return this.service.saveProforma({
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
