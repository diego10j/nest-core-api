import { Query, Controller, Get, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { ComprobantesInvService } from './comprobantes.service';
import { CabComprobanteInventarioDto } from './dto/cab-compr-inv.dto';
import { ComprobantesInvDto } from './dto/comprobantes-inv.dto';
import { LoteEgreso } from './dto/lote-egreso.dto';
import { LoteIngreso } from './dto/lote-ingreso.dto';
import { LotesProductoProveedorDto } from './dto/lotes-producto-proveedor.dto';
import { LotesProductoDto } from './dto/lotes-producto.dto';
import { SaveDetInvEgresoDto } from './dto/save-det-inv-ingreso.dto';
import { SaveLoteDto } from './dto/save-lote.dto';
import { SetComporbantesVerificadosDto } from './dto/set-compro-verificado.dto';
@ApiTags('Inventario-Comprobantes')
@Controller('inventario/comprobantes')
export class ComprobantesInvController {
  constructor(private readonly service: ComprobantesInvService) { }

  @Get('getComprobantesInventario')
  @ApiOperation({ summary: 'Listar comprobantes de inventario por período y tipo' })
  @Auth()
  getComprobantesInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprobantesInvDto) {
    return this.service.getComprobantesInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getComprobantesIngresoPendientes')
  @ApiOperation({ summary: 'Listar comprobantes de ingreso pendientes de verificación' })
  @Auth()
  getComprobantesIngresoPendientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprobantesInvDto) {
    return this.service.getComprobantesIngresoPendientes({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getComprobantesEgresoPendientes')
  @ApiOperation({ summary: 'Listar comprobantes de egreso pendientes de verificación' })
  @Auth()
  getComprobantesEgresoPendientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprobantesInvDto) {
    return this.service.getComprobantesEgresoPendientes({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getDetComprobanteInventario')
  @ApiOperation({ summary: 'Obtener detalle de un comprobante de inventario' })
  @Auth()
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
  @ApiOperation({ summary: 'Obtener cabecera de un comprobante de inventario' })
  @Auth()
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
  @ApiOperation({ summary: 'Marcar comprobantes de inventario como verificados' })
  @Auth()
  generarConfigPreciosVenta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SetComporbantesVerificadosDto) {
    return this.service.setComporbantesVerificados({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveDetInvEgreso')
  @ApiOperation({ summary: 'Guardar detalle de egreso de inventario' })
  @Auth()
  saveDetInvEgreso(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetInvEgresoDto) {
    return this.service.saveDetInvEgreso({
      ...headersParams,
      ...dtoIn,
    });
  }



  @Post('anularComprobante')
  @ApiOperation({ summary: 'Anular un comprobante de inventario' })
  @Auth()
  anularComprobante(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CabComprobanteInventarioDto) {
    return this.service.anularComprobante({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('verificarComprobante')
  @ApiOperation({ summary: 'Verificar y aprobar un comprobante de inventario' })
  @Auth()
  verificarComprobante(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CabComprobanteInventarioDto) {
    return this.service.verificarComprobante({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getLoteIngreso')
  @ApiOperation({ summary: 'Obtener lotes disponibles para ingreso por producto' })
  @Auth()
  getLoteIngreso(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LoteIngreso) {
    return this.service.getLoteIngreso({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getLoteEgreso')
  @ApiOperation({ summary: 'Obtener lotes con stock disponible para egreso por producto' })
  @Auth()
  getLoteEgreso(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LoteEgreso) {
    return this.service.getLoteEgreso({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Post('saveLoteIngreso')
  @ApiOperation({ summary: 'Registrar ingreso de lote de inventario' })
  @Auth()
  saveLoteIngreso(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveLoteDto) {
    return this.service.saveLoteIngreso({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveLoteEgreso')
  @ApiOperation({ summary: 'Registrar egreso de lote de inventario' })
  @Auth()
  saveLoteEgreso(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveLoteDto) {
    return this.service.saveLoteEgreso({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('validarDetallesVerificados')
  @ApiOperation({ summary: 'Validar que todos los detalles de un comprobante estén verificados' })
  @Auth()
  validarDetallesVerificados(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CabComprobanteInventarioDto) {
    return this.service.validarDetallesVerificados({
      ...headersParams,
      ...dtoIn,
    });
  }



  // getLotesProductoProveedor  
  @Get('getLotePorProductoProveedor')
  @ApiOperation({ summary: 'Obtener lotes de un producto filtrados por proveedor' })
  @Auth()
  getLotePorProductoProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LotesProductoProveedorDto) {
    return this.service.getLotePorProductoProveedor({
      ...headersParams,
      ...dtoIn,
    });
  }

  // ==================================ListData==============================
  @Get('getListDataEstadosComprobantes')
  @ApiOperation({ summary: 'Obtener estados de comprobante de inventario para selector' })
  @Auth()
  getListDataEstadosComprobantes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataEstadosComprobantes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataPresentacion')
  @ApiOperation({ summary: 'Obtener unidades de presentación de inventario para selector' })
  @Auth()
  getListDataPresentacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataPresentacion({
      ...headersParams,
      ...dtoIn,
    });
  }




  @Get('getLotesIngresoProducto')
  @ApiOperation({ summary: 'Listar lotes de ingreso registrados para un producto' })
  @Auth()
  getLotesIngresoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LotesProductoDto) {
    return this.service.getLotesIngresoProducto({
      ...headersParams,
      ...dtoIn,
    });
  }



}
