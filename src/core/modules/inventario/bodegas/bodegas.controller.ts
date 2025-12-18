import { Query, Controller, Get, Body, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { BodegasService } from './bodegas.service';
import { GeneraConteoInvDto } from './dto/genera-conteo-inv.dto';
import { GetConteosInventarioDto } from './dto/get-conteos-inv.dto';
import { GetDetallesConteoDto } from './dto/get-detalles-conteo.dto';
import { MovimientosBodegaDto } from './dto/mov-bodega.dto';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { RegistrarConteoFisicoDto } from './dto/registrar-conteo.dto';
import { StockProductosDto } from './dto/stock-productos.dto';

@ApiTags('Inventario-Bodegas')
@Controller('inventario/bodegas')
export class BodegasController {
  constructor(private readonly service: BodegasService) { }

  @Get('getBodegas')
  // @Auth()
  getBodegas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getBodegas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getBodega')
  // @Auth()
  getBodega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getBodega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getMovimientos')
  // @Auth()
  getMovimientos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: MovimientosInvDto) {
    return this.service.getMovimientos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getMovimientosBodega')
  // @Auth()
  getMovimientosBodega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: MovimientosBodegaDto) {
    return this.service.getMovimientosBodega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getStockProductos')
  // @Auth()
  getStockProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: StockProductosDto) {
    return this.service.getStockProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataBodegas')
  // @Auth()
  getListDataBodegas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataBodegas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataDetalleStock')
  // @Auth()
  getListDataDetalleStock(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataDetalleStock({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Post('generarConteoInventario')
  // @Auth()
  generarConteoInventario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GeneraConteoInvDto) {
    return this.service.generarConteoInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('registrarConteoFisico')
  // @Auth()
  registrarConteoFisico(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RegistrarConteoFisicoDto) {
    return this.service.registrarConteoFisico({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('registrarReconteoFisico')
  // @Auth()
  registrarReconteoFisico(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RegistrarConteoFisicoDto) {
    return this.service.registrarReconteoFisico({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getConteosInventario')
  // @Auth()
  getConteosInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetConteosInventarioDto) {
    return this.service.getConteosInventario({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getDetalleConteo')
  // @Auth()
  getDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetallesConteoDto) {
    return this.service.getDetalleConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEstadisticasConteos')
  // @Auth()
  getEstadisticasConteos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetConteosInventarioDto) {
    return this.service.getEstadisticasConteos({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getListDataEstadosConteo')
  // @Auth()
  getListDataEstadosConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataEstadosConteo({
      ...headersParams,
      ...dtoIn,
    });
  }


}
