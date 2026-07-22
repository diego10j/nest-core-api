import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

import { VariacionVentasPeriodoDto } from '../facturas/dto/variacion-periodos.dto';
import { VentasDiariasDto } from '../facturas/dto/ventas-diarias.dto';
import { VentasMensualesDto } from '../facturas/dto/ventas-mensuales.dto';

import { TopClientesDto } from './dto/top-clientes.dto';
import { VentasBiService } from './ventas-bi.service';
import { Auth } from 'src/core/auth';

@ApiTags('Ventas-DataBI')
@Controller('ventas/data-bi')
export class VentasBiController {
  constructor(private readonly service: VentasBiService) { }

  @Get('getTotalVentasPeriodo')
  @ApiOperation({ summary: 'Obtener total de ventas por período mensual/anual' })
  @Auth()
  getTotalVentasPeriodo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.service.getTotalVentasPeriodo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVariacionDiariaVentas')
  @ApiOperation({ summary: 'Obtener variación diaria de ventas en un rango de fechas' })
  @Auth()
  getVariacionDiariaVentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasDiariasDto) {
    return this.service.getVariacionDiariaVentas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTendenciaVentasDia')
  @ApiOperation({ summary: 'Obtener tendencia de ventas por día en un rango de fechas' })
  @Auth()
  getTendenciaVentasDia(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTendenciaVentasDia({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopVendedores')
  @ApiOperation({ summary: 'Obtener top de vendedores por monto de ventas en un período' })
  @Auth()
  getTopVendedores(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTopVendedores({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalVentasPorFormaPago')
  @ApiOperation({ summary: 'Obtener total de ventas agrupado por forma de pago' })
  @Auth()
  getTotalVentasPorFormaPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTotalVentasPorFormaPago({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalVentasPorHora')
  @ApiOperation({ summary: 'Obtener distribución de ventas por hora del día' })
  @Auth()
  getTotalVentasPorHora(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getTotalVentasPorHora({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopClientes')
  @ApiOperation({ summary: 'Obtener top de clientes por monto de compras en un período' })
  @Auth()
  getTopClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
    return this.service.getTopClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasPorCategoriaProducto')
  @ApiOperation({ summary: 'Obtener total de ventas agrupado por categoría de producto' })
  @Auth()
  getVentasPorCategoriaProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getVentasPorCategoriaProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasPorIdCliente')
  @ApiOperation({ summary: 'Obtener total de ventas agrupado por tipo de identificación de cliente' })
  @Auth()
  getVentasPorIdCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getVentasPorIdCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTasaCrecimientoMensual')
  @ApiOperation({ summary: 'Obtener tasa de crecimiento mensual de ventas' })
  @Auth()
  getTasaCrecimientoMensual(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.service.getTasaCrecimientoMensual({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasMayorValor')
  @ApiOperation({ summary: 'Obtener facturas de mayor valor en un período' })
  @Auth()
  getFacturasMayorValor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
    return this.service.getFacturasMayorValor({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getResumenVentasPeriodos')
  @ApiOperation({ summary: 'Obtener resumen comparativo de ventas entre períodos (actual, anterior, hace 2 años)' })
  @Auth()
  getResumenVentasPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getResumenVentasPeriodos(headersParams);
  }

  @Get('getVariacionVentasPeriodos')
  @ApiOperation({ summary: 'Obtener variación de ventas entre dos períodos seleccionados' })
  @Auth()
  getVariacionVentasPeriodos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VariacionVentasPeriodoDto) {
    return this.service.getVariacionVentasPeriodos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasPorDiaDelMes')
  @ApiOperation({ summary: 'Obtener ventas agrupadas por día del mes en un rango de fechas' })
  @Auth()
  getVentasPorDiaDelMes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getVentasPorDiaDelMes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getKPIsVentas')
  @ApiOperation({ summary: 'Obtener KPIs principales de ventas (ticket promedio, nuevos clientes, etc.)' })
  @Auth()
  getKPIsVentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getKPIsVentas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductosMasRentables')
  @ApiOperation({ summary: 'Obtener top de productos con mayor utilidad bruta en un período' })
  @Auth()
  getProductosMasRentables(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
    return this.service.getProductosMasRentables({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalClientesPorProvincia')
  @ApiOperation({ summary: 'Obtener distribución de clientes por provincia' })
  @Auth()
  getTotalClientesPorProvincia(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getTotalClientesPorProvincia(headersParams);
  }

  @Get('getTopClientesFacturas')
  @ApiOperation({ summary: 'Obtener top de clientes por número de facturas emitidas' })
  @Auth()
  getTopClientesFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
    return this.service.getTopClientesFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalClientesPorPeriodo')
  @ApiOperation({ summary: 'Obtener total de clientes activos comparado por período' })
  @Auth()
  getTotalClientesPorPeriodo(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getTotalClientesPorPeriodo(headersParams);
  }

  @Get('getTotalClientesPorPeriodoVendedor')
  @ApiOperation({ summary: 'Obtener total de clientes activos por período para un vendedor específico' })
  @Auth()
  getTotalClientesPorPeriodoVendedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
    return this.service.getTotalClientesPorPeriodoVendedor({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getResumenClientesPorVendedor')
  @ApiOperation({ summary: 'Obtener resumen de cartera de clientes por vendedor' })
  @Auth()
  getResumenClientesPorVendedor(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getResumenClientesPorVendedor(headersParams);
  }
}
