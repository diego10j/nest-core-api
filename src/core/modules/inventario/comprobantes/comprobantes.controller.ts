import { Query, Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { ComprobantesInvService } from './comprobantes.service';
import { CabComprobanteInventarioDto } from './dto/cab-compr-inv.dto';
import { ComprobantesInvDto } from './dto/comprobantes-inv.dto';
import { MovimientosPendientesInvDto } from './dto/mov-pendientes-inv.dto';
import { SaveDetInvIngresoDtoDto } from './dto/save-det-inv-ingreso.dto';
@ApiTags('Inventario-Comprobantes')
@Controller('inventario/comprobantes')
export class ComprobantesInvController {
  constructor(private readonly service: ComprobantesInvService) {}

  @Get('getComprobantesInventario')
  // @Auth()
  getComprobantesInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprobantesInvDto) {
    return this.service.getComprobantesInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDetComprobanteInventario')
  // @Auth()
  getDetComprobanteInventario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CabComprobanteInventarioDto,
  ) {
    return this.service.getDetComprobanteInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCabComprobanteInventario')
  // @Auth()
  getCabComprobanteInventario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CabComprobanteInventarioDto,
  ) {
    return this.service.getCabComprobanteInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getIngresosPendientes')
  // @Auth()
  getIngresosPendientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: MovimientosPendientesInvDto) {
    return this.service.getIngresosPendientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEgresosPendientes')
  // @Auth()
  getEgresosPendientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: MovimientosPendientesInvDto) {
    return this.service.getEgresosPendientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('setComporbantesVerificados')
  //@Auth()
  generarConfigPreciosVenta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
    return this.service.setComporbantesVerificados({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveDetInvIngreso')
  //@Auth()
  saveDetInvIngreso(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetInvIngresoDtoDto) {
    return this.service.saveDetInvIngreso({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('anularComprobante')
  // @Auth()
  anularComprobante(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CabComprobanteInventarioDto) {
    return this.service.anularComprobante({
      ...headersParams,
      ...dtoIn,
    });
  }

  // ==================================ListData==============================
  @Get('getListDataEstadosComprobantes')
  // @Auth()
  getListDataEstadosComprobantes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataEstadosComprobantes({
      ...headersParams,
      ...dtoIn,
    });
  }
}
