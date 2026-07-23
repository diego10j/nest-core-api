import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { Auth } from 'src/core/auth';

import { ProformasMensualesDto } from '../dto/proformas-mensuales.dto';

import { ProformasBiService } from './proformas-bi.service';

@ApiTags('Proformas-DataBI')
@Controller('proformas/data-bi')
export class ProformasBiController {
  constructor(private readonly service: ProformasBiService) { }

  @Get('getProformasMensuales')
  @ApiOperation({ summary: 'Obtener proformas mensuales por año' })
  @Auth()
  getProformasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProformasMensualesDto) {
    return this.service.getProformasMensuales({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopProductos')
  @ApiOperation({ summary: 'Obtener top de productos más cotizados en proformas por período' })
  @Auth()
  getTopProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTopProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopProductosMayorUtilidad')
  @ApiOperation({ summary: 'Obtener top de productos con mayor utilidad en proformas' })
  @Auth()
  getTopProductosMayorUtilidad(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTopProductosMayorUtilidad({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEfectividadPorVendedor')
  @ApiOperation({ summary: 'Obtener tasa de conversión de proformas por vendedor' })
  getEfectividadPorVendedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getEfectividadPorVendedor({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTendenciaDiaria')
  @ApiOperation({ summary: 'Obtener tendencia diaria de proformas emitidas' })
  getTendenciaDiaria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTendenciaDiaria({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopClientes')
  @ApiOperation({ summary: 'Obtener top de clientes con más proformas generadas' })
  getTopClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTopClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTiempoConversion')
  @ApiOperation({ summary: 'Obtener tiempo promedio de conversión de proforma a factura' })
  getTiempoConversion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTiempoConversion({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getResumenCotizaciones')
  @ApiOperation({ summary: 'Obtener resumen de cotizaciones por estado (aprobadas, rechazadas, pendientes)' })
  getResumenCotizaciones(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getResumenCotizaciones({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVariacionCotizaciones')
  @ApiOperation({ summary: 'Obtener variación de cotizaciones entre períodos' })
  getVariacionCotizaciones(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getVariacionCotizaciones(headersParams);
  }

  @Get('getComportamientoClientes')
  @ApiOperation({ summary: 'Obtener comportamiento de clientes en proformas (frecuencia, monto)' })
  getComportamientoClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getComportamientoClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCotizacionesPendientes')
  @ApiOperation({ summary: 'Obtener cotizaciones pendientes de respuesta en un rango de fechas' })
  getCotizacionesPendientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getCotizacionesPendientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAnalisisPerdidas')
  @ApiOperation({ summary: 'Obtener análisis de proformas perdidas (rechazadas o vencidas)' })
  getAnalisisPerdidas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getAnalisisPerdidas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEfectividadPorTipo')
  @ApiOperation({ summary: 'Obtener efectividad de conversión agrupada por tipo de proforma' })
  getEfectividadPorTipo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getEfectividadPorTipo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getHisConversionPorCliente')
  @ApiOperation({ summary: 'Obtener historial de conversión de proformas por cliente' })
  getHisConversionPorCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getHisConversionPorCliente({
      ...headersParams,
      ...dtoIn,
    });
  }
}
