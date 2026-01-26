import { Query, Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { ComprobantesInvService } from './comprobantes.service';
import { CabComprobanteInventarioDto } from './dto/cab-compr-inv.dto';
import { ComprobantesInvDto } from './dto/comprobantes-inv.dto';
import { LoteIngreso } from './dto/lote-ingreso.dto';
import { SaveDetInvEgresoDto } from './dto/save-det-inv-ingreso.dto';
import { SaveLoteDto } from './dto/save-lote.dto';
import { LoteEgreso } from './dto/lote-egreso.dto';
import { LotesProductoDto } from './dto/lotes-producto.dto';
@ApiTags('Inventario-Comprobantes')
@Controller('inventario/comprobantes')
export class ComprobantesInvController {
  constructor(private readonly service: ComprobantesInvService) { }

  @Get('getComprobantesInventario')
  // @Auth()
  getComprobantesInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprobantesInvDto) {
    return this.service.getComprobantesInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getComprobantesIngresoPendientes')
  // @Auth()
  getComprobantesIngresoPendientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprobantesInvDto) {
    return this.service.getComprobantesIngresoPendientes({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getComprobantesEgresoPendientes')
  // @Auth()
  getComprobantesEgresoPendientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprobantesInvDto) {
    return this.service.getComprobantesEgresoPendientes({
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


  @Post('setComporbantesVerificados')
  //@Auth()
  generarConfigPreciosVenta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
    return this.service.setComporbantesVerificados({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveDetInvEgreso')
  //@Auth()
  saveDetInvEgreso(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetInvEgresoDto) {
    return this.service.saveDetInvEgreso({
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

  @Get('getLoteIngreso')
  // @Auth()
  getLoteIngreso(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LoteIngreso) {
    return this.service.getLoteIngreso({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getLoteEgreso')
  // @Auth()
  getLoteEgreso(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LoteEgreso) {
    return this.service.getLoteEgreso({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Post('saveLoteIngreso')
  //@Auth()
  saveLoteIngreso(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveLoteDto) {
    return this.service.saveLoteIngreso({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveLoteEgreso')
  //@Auth()
  saveLoteEgreso(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveLoteDto) {
    return this.service.saveLoteEgreso({
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

  @Get('getListDataPresentacion')
  // @Auth()
  getListDataPresentacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataPresentacion({
      ...headersParams,
      ...dtoIn,
    });
  }




  @Get('getLotesIngresoProducto')
  // @Auth()
  getLotesIngresoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LotesProductoDto) {
    return this.service.getLotesIngresoProducto({
      ...headersParams,
      ...dtoIn,
    });
  }
}
