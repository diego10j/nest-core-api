import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { Auth } from 'src/core/auth';

import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';

@ApiTags('CuentasPorCobrar')
@Controller('cuentas-por-cobrar')
export class CuentasPorCobrarController {
  constructor(private readonly service: CuentasPorCobrarService) { }

  @Get('getCuentasPorCobrar')
  @ApiOperation({ summary: 'Listar cuentas por cobrar en un rango de fechas' })
  @Auth()
  getCuentasPorCobrar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getCuentasPorCobrar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getMetricasCuentasPorCobrar')
  @ApiOperation({ summary: 'Obtener métricas de cuentas por cobrar (totales, vencidas, al día)' })
  @Auth()
  getMetricasCuentasPorCobrar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getMetricasCuentasPorCobrar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getClientesPagoDestiempo')
  @ApiOperation({ summary: 'Listar clientes con historial de pagos tardíos' })
  @Auth()
  getClientesPagoDestiempo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getClientesPagoDestiempo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getResumenCuentasPorCobrar')
  @ApiOperation({ summary: 'Obtener resumen de cuentas por cobrar agrupado por antigüedad' })
  @Auth()
  getResumenCuentasPorCobrar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getResumenCuentasPorCobrar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReporteCxCDetallado')
  @ApiOperation({ summary: 'Obtener reporte detallado de cuentas por cobrar' })
  @Auth()
  getReporteCxCDetallado(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getReporteCxCDetallado({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReporteDiferenciasCxc')
  @ApiOperation({ summary: 'Detectar cabeceras CxC con desbalance entre cargos y abonos' })
  getReporteDiferenciasCxc(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getReporteDiferenciasCxc({ ...headersParams, ...dtoIn });
  }
}
