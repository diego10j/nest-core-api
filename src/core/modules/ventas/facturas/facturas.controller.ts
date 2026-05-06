import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { FacturasDto } from './dto/facturas.dto';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasService } from './facturas.service';
import { GetFacturaDto } from './dto/get-factura.dto';
import { SaveFacturaDto } from './dto/save-factura.dto';
import { ResumenDiarioFacturasDto } from './dto/resumen-diario-facturas.dto';
import { UtilidadVentasDto } from './dto/get-util-ventas';

@ApiTags('Ventas-Facturas')
@Controller('ventas/facturas')
export class FacturasController {
  constructor(private readonly service: FacturasService) { }

  @Get('getPuntosEmisionFacturas')
  @ApiOperation({ summary: 'Obtener puntos de emisión habilitados para facturas' })
  // @Auth()
  getPuntosEmisionFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PuntosEmisionFacturasDto) {
    return this.service.getPuntosEmisionFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryPuntosEmisionFacturas')
  @ApiOperation({ summary: 'Consulta tabla de puntos de emisión para facturas' })
  // @Auth()
  getTableQueryPuntosEmisionFacturas(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PuntosEmisionFacturasDto,
  ) {
    return this.service.getTableQueryPuntosEmisionFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturas')
  @ApiOperation({ summary: 'Listar facturas por período y filtros' })
  // @Auth()
  getFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasAnuladas')
  @ApiOperation({ summary: 'Listar facturas anuladas por período' })
  // @Auth()
  getFacturasAnuladas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasAnuladas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasConNotasCredito')
  @ApiOperation({ summary: 'Listar facturas que tienen notas de crédito asociadas' })
  // @Auth()
  getFacturasConNotasCredito(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasConNotasCredito({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getUtilidadVentas')
  @ApiOperation({ summary: 'Obtener utilidad de ventas por período' })
  // @Auth()
  getUtilidadVentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UtilidadVentasDto) {
    return this.service.getUtilidadVentas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalFacturasPorEstado')
  @ApiOperation({ summary: 'Obtener totales de facturas agrupadas por estado' })
  // @Auth()
  getTotalFacturasPorEstado(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getTotalFacturasPorEstado({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasPorCobrar')
  @ApiOperation({ summary: 'Listar facturas pendientes de cobro' })
  // @Auth()
  getFacturasPorCobrar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasPorCobrar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturaById')
  @ApiOperation({ summary: 'Obtener factura por ID' })
  // @Auth()
  getFacturaById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetFacturaDto) {
    return this.service.getFacturaById({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSecuencialFactura')
  @ApiOperation({ summary: 'Obtener siguiente secuencial para un punto de emisión' })
  // @Auth()
  getSecuencialFactura(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetFacturaDto,
  ) {
    return this.service.getSecuencialFactura({
      ...headersParams,
      ide_ccdaf: dtoIn.ide_cccfa,
    });
  }

  @Post('saveFactura')
  @ApiOperation({ summary: 'Crear o actualizar una factura' })
  // @Auth()
  saveFactura(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: SaveFacturaDto,
  ) {
    return this.service.saveFactura({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getResumenDiarioFacturas')
  @ApiOperation({ summary: 'Obtener resumen diario de facturación' })
  // @Auth()
  getResumenDiarioFacturas(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: ResumenDiarioFacturasDto,
  ) {
    return this.service.getResumenDiarioFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

}