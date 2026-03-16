import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { CreateProformaWebDto } from './dto/create-proforma-web.dto';
import { GetPrecioClienteDto } from './dto/get-precio-cliente.dto';
import { GetProformaDto } from './dto/get-proforma.dto';
import { ProformasDto } from './dto/proformas.dto';
import { SaveProformaDto } from './dto/save-proforma.dto';
import { ProformasService } from './proformas.service';

@Controller('proformas')
export class ProformasController {
  constructor(private readonly service: ProformasService) { }

  @Post('calcularPreciosCliente')
  // @Auth()
  calcularPreciosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GetPrecioClienteDto) {
    return this.service.calcularPreciosCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

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

  @Get('getListDataTipoProforma')
  // @Auth()
  getListDataTipoProforma(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataTipoProforma({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataTiempoEntrega')
  // @Auth()
  getListDataTiempoEntrega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataTiempoEntrega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataValidezProforma')
  // @Auth()
  getListDataValidezProforma(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataValidezProforma({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getListDataFormaPago')
  // @Auth()
  getListDataFormaPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataFormaPago({
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
