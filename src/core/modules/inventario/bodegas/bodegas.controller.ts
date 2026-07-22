import { Query, Controller, Get, Body, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { Auth } from 'src/core/auth';

@ApiTags('Inventario-Bodegas')
@Controller('inventario/bodegas')
export class BodegasController {
  constructor(private readonly service: BodegasService) { }

  @Get('getBodegas')
  @ApiOperation({ summary: 'Listar bodegas de la empresa' })
  @Auth()
  getBodegas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getBodegas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getBodega')
  @ApiOperation({ summary: 'Obtener bodega por ID' })
  @Auth()
  getBodega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getBodega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getMovimientos')
  @ApiOperation({ summary: 'Listar movimientos de inventario por período' })
  @Auth()
  getMovimientos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: MovimientosInvDto) {
    return this.service.getMovimientos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getMovimientosBodega')
  @ApiOperation({ summary: 'Listar movimientos de una bodega específica' })
  @Auth()
  getMovimientosBodega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: MovimientosBodegaDto) {
    return this.service.getMovimientosBodega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getStockProductos')
  @ApiOperation({ summary: 'Obtener stock de productos en bodegas' })
  @Auth()
  getStockProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: StockProductosDto) {
    return this.service.getStockProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataBodegas')
  @ApiOperation({ summary: 'Obtener listado de bodegas para selector' })
  @Auth()
  getListDataBodegas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataBodegas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataDetalleStock')
  @ApiOperation({ summary: 'Obtener detalle de stock por bodega para selector' })
  @Auth()
  getListDataDetalleStock(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataDetalleStock({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('generarConteoInventario')
  @ApiOperation({ summary: 'Generar conteo de inventario físico' })
  @Auth()
  generarConteoInventario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GeneraConteoInvDto) {
    return this.service.generarConteoInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('registrarConteoFisico')
  @ApiOperation({ summary: 'Registrar conteo físico de inventario' })
  @Auth()
  registrarConteoFisico(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RegistrarConteoFisicoDto) {
    return this.service.registrarConteoFisico({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('registrarReconteoFisico')
  @ApiOperation({ summary: 'Registrar reconteo físico de inventario para ajuste' })
  @Auth()
  registrarReconteoFisico(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RegistrarConteoFisicoDto) {
    return this.service.registrarReconteoFisico({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('eliminarProductosConteo')
  @ApiOperation({ summary: 'Eliminar productos de un conteo físico de inventario' })
  @Auth()
  eliminarProductosConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
    return this.service.eliminarProductosConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('agregarProductoConteo')
  @ApiOperation({ summary: 'Agregar producto a un conteo físico de inventario' })
  @Auth()
  agregarProductoConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: AgregaProductoConteoDto) {
    return this.service.agregarProductoConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('validarDetallesConteo')
  @ApiOperation({ summary: 'Validar cantidades contadas en detalles de conteo' })
  @Auth()
  validarDetallesConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ValidarDetallesConteoDto) {
    return this.service.validarDetallesConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('autorizarAjustesConteo')
  @ApiOperation({ summary: 'Autorizar ajustes de inventario generados por diferencias del conteo' })
  @Auth()
  autorizarAjustesConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: AutorizaAjustesConteoDto) {
    return this.service.autorizarAjustesConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updateEstadoConteo')
  @ApiOperation({ summary: 'Actualizar estado de un conteo de inventario' })
  @Auth()
  updateEstadoConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UpdateEstadoConteoDto) {
    return this.service.updateEstadoConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updateEstadoDetalleConteo')
  @ApiOperation({ summary: 'Actualizar estado de un detalle de conteo físico' })
  @Auth()
  updateEstadoDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UpdateEstadoDetalleConteoDto) {
    return this.service.updateEstadoDetalleConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataEstadosDetalleConteo')
  @ApiOperation({ summary: 'Obtener estados de detalle de conteo para selector' })
  @Auth()
  getListDataEstadosDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataEstadosDetalleConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getConteosInventario')
  @ApiOperation({ summary: 'Listar conteos de inventario por período y estado' })
  @Auth()
  getConteosInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetConteosInventarioDto) {
    return this.service.getConteosInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDetalleConteo')
  @ApiOperation({ summary: 'Obtener detalle de productos de un conteo físico' })
  @Auth()
  getDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetallesConteoDto) {
    return this.service.getDetalleConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataEstadosConteo')
  @ApiOperation({ summary: 'Obtener estados de conteo de inventario para selector' })
  @Auth()
  getListDataEstadosConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataEstadosConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('buscarDetalleConteo')
  @ApiOperation({ summary: 'Buscar producto en detalle de conteo por código o nombre' })
  @Auth()
  buscarDetalleConteo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDetalleConteoDto) {
    return this.service.buscarDetalleConteo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getMisConteosInventario')
  @ApiOperation({ summary: 'Listar conteos de inventario asignados al usuario actual' })
  @Auth()
  getMisConteosInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetConteosInventarioDto) {
    return this.service.getMisConteosInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getUltimaFechaConteoProducto')
  @ApiOperation({ summary: 'Obtener la última fecha en que se contó un producto' })
  @Auth()
  getUltimaFechaConteoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getUltimaFechaConteoProducto({
      ...headersParams,
      ...dtoIn,
    });
  }
}
