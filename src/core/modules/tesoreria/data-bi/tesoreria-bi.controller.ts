import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { RangoFechasSucursalDto } from './dto/rango-fechas-sucursal.dto';
import { TesoreriaDiariaDto } from './dto/tesoreria-diaria.dto';
import { TesoreriaMensualDto } from './dto/tesoreria-mensual.dto';
import { TopCuentasTesoreriaDto } from './dto/top-cuentas-tesoreria.dto';
import { TesoreriaBiService } from './tesoreria-bi.service';

@ApiTags('Tesoreria-DataBI')
@Controller('tesoreria/data-bi')
export class TesoreriaBiController {
  constructor(private readonly service: TesoreriaBiService) {}

  @Get('getKPIsTesoreria')
  @ApiOperation({ summary: 'Obtener KPIs principales de tesorería (ingresos, egresos, flujo neto, saldo)' })
  @Auth()
  getKPIsTesoreria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasSucursalDto) {
    return this.service.getKPIsTesoreria({ ...headersParams, ...dtoIn });
  }

  @Get('getVariacionDiariaTesoreria')
  @ApiOperation({ summary: 'Obtener variación diaria del flujo de tesorería' })
  @Auth()
  getVariacionDiariaTesoreria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TesoreriaDiariaDto) {
    return this.service.getVariacionDiariaTesoreria({ ...headersParams, ...dtoIn });
  }

  @Get('getFlujoMensualTesoreria')
  @ApiOperation({ summary: 'Obtener flujo de tesorería mensual (ingresos/egresos) en un año' })
  @Auth()
  getFlujoMensualTesoreria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TesoreriaMensualDto) {
    return this.service.getFlujoMensualTesoreria({ ...headersParams, ...dtoIn });
  }

  @Get('getIngresosMensualesPorBanco')
  @ApiOperation({ summary: 'Obtener ingresos/egresos mensuales agrupados por banco' })
  @Auth()
  getIngresosMensualesPorBanco(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TesoreriaMensualDto) {
    return this.service.getIngresosMensualesPorBanco({ ...headersParams, ...dtoIn });
  }

  @Get('getIngresosMensualesPorCaja')
  @ApiOperation({ summary: 'Obtener ingresos/egresos mensuales agrupados por caja' })
  @Auth()
  getIngresosMensualesPorCaja(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TesoreriaMensualDto) {
    return this.service.getIngresosMensualesPorCaja({ ...headersParams, ...dtoIn });
  }

  @Get('getIngresosMensualesPorTarjeta')
  @ApiOperation({ summary: 'Obtener ingresos/egresos mensuales agrupados por cuenta de tarjeta' })
  @Auth()
  getIngresosMensualesPorTarjeta(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TesoreriaMensualDto) {
    return this.service.getIngresosMensualesPorTarjeta({ ...headersParams, ...dtoIn });
  }

  @Get('getTopCuentas')
  @ApiOperation({ summary: 'Obtener top de cuentas (banco/caja/tarjeta) por monto movilizado' })
  @Auth()
  getTopCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasTesoreriaDto) {
    return this.service.getTopCuentas({ ...headersParams, ...dtoIn });
  }

  @Get('getDistribucionPorTipoCuenta')
  @ApiOperation({ summary: 'Obtener distribución de movimientos por tipo de cuenta (Banco/Caja/Tarjeta)' })
  @Auth()
  getDistribucionPorTipoCuenta(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasSucursalDto) {
    return this.service.getDistribucionPorTipoCuenta({ ...headersParams, ...dtoIn });
  }

  @Get('getResumenTesoreriaPeriodos')
  @ApiOperation({ summary: 'Obtener resumen comparativo de tesorería por año' })
  @Auth()
  getResumenTesoreriaPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getResumenTesoreriaPeriodos(headersParams);
  }
}
