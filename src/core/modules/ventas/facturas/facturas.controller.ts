import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

import { FacturasDto } from './dto/facturas.dto';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasService } from './facturas.service';
import { GetFacturaDto } from './dto/get-factura.dto';
import { SaveFacturaDto } from './dto/save-factura.dto';
import { ResumenDiarioFacturasDto } from './dto/resumen-diario-facturas.dto';

@Controller('ventas/facturas')
export class FacturasController {
  constructor(private readonly service: FacturasService) { }

  @Get('getPuntosEmisionFacturas')
  // @Auth()
  getPuntosEmisionFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PuntosEmisionFacturasDto) {
    return this.service.getPuntosEmisionFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryPuntosEmisionFacturas')
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
  // @Auth()
  getFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasAnuladas')
  // @Auth()
  getFacturasAnuladas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasAnuladas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasConNotasCredito')
  // @Auth()
  getFacturasConNotasCredito(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasConNotasCredito({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getUtilidadVentas')
  // @Auth()
  getUtilidadVentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getUtilidadVentas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalFacturasPorEstado')
  // @Auth()
  getTotalFacturasPorEstado(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getTotalFacturasPorEstado({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasPorCobrar')
  // @Auth()
  getFacturasPorCobrar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasPorCobrar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturaById')
  // @Auth()
  getFacturaById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetFacturaDto) {
    return this.service.getFacturaById({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSecuencialFactura')
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