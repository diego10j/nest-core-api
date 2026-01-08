import { Query, Controller, Get, Body, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { BodegasService } from './bodegas.service';
import { AgregaProductoConteoDto } from './dto/agrega-producto-conteo.dto';
import { AutorizaAjustesConteoDto } from './dto/autoriza-ajustes.dto';
import { GeneraConteoInvDto } from './dto/genera-conteo-inv.dto';
import { GetConteosInventarioDto } from './dto/get-conteos-inv.dto';
import { GetDetallesConteoDto } from './dto/get-detalles-conteo.dto';
import { MovimientosBodegaDto } from './dto/mov-bodega.dto';
import { MovimientosInvDto } from './dto/movimientos-inv.dto';
import { RegistrarConteoFisicoDto } from './dto/registrar-conteo.dto';
import { SearchDetalleConteoDto } from './dto/search-detalle-conteo.dto';
import { StockProductosDto } from './dto/stock-productos.dto';
import { UpdateEstadoConteoDto } from './dto/update-estado-conteo.dto';
import { UpdateEstadoDetalleConteoDto } from './dto/update-estado-deta-conteo.dto';
import { ValidarDetallesConteoDto } from './dto/validar_conteo.dto';

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



  @Post('eliminarProductosConteo')
  // @Auth()
  eliminarProductosConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
    return this.service.eliminarProductosConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('agregarProductoConteo')
  // @Auth()
  agregarProductoConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: AgregaProductoConteoDto) {
    return this.service.agregarProductoConteo({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Post('validarDetallesConteo')
  // @Auth()
  validarDetallesConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ValidarDetallesConteoDto) {
    return this.service.validarDetallesConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('autorizarAjustesConteo')
  // @Auth()
  autorizarAjustesConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: AutorizaAjustesConteoDto) {
    return this.service.autorizarAjustesConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updateEstadoConteo')
  // @Auth()
  updateEstadoConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UpdateEstadoConteoDto) {
    return this.service.updateEstadoConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updateEstadoDetalleConteo')
  // @Auth()
  updateEstadoDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UpdateEstadoDetalleConteoDto) {
    return this.service.updateEstadoDetalleConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataEstadosDetalleConteo')
  // @Auth()
  getListDataEstadosDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataEstadosDetalleConteo({
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


  @Get('getListDataEstadosConteo')
  // @Auth()
  getListDataEstadosConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataEstadosConteo({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('buscarDetalleConteo')
  // @Auth()
  buscarDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDetalleConteoDto) {
    return this.service.buscarDetalleConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getMisConteosInventario')
  // @Auth()
  getMisConteosInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetConteosInventarioDto) {
    return this.service.getMisConteosInventario({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getUltimaFechaConteoProducto')
  // @Auth()
  getUltimaFechaConteoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getUltimaFechaConteoProducto({
      ...headersParams,
      ...dtoIn,
    });
  }



}
