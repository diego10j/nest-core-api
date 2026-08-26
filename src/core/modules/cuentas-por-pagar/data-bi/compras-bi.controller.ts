import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { Auth } from 'src/core/auth';

import { ComprasBiService } from './compras-bi.service';
import { ComparativoVentasComprasDto } from './dto/comparativo-ventas-compras.dto';
import { ComprasDiariasDto } from './dto/compras-diarias.dto';
import { ComprasMensualesDto } from './dto/compras-mensuales.dto';
import { TopProveedoresDto } from './dto/top-proveedores.dto';

@ApiTags('Compras-DataBI')
@Controller('compras/data-bi')
export class ComprasBiController {
  constructor(private readonly service: ComprasBiService) {}

  @Get('getKPIsCompras')
  @ApiOperation({ summary: 'Obtener KPIs principales de compras (ticket promedio, proveedores activos, etc.)' })
  @Auth()
  getKPIsCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getKPIsCompras({ ...headersParams, ...dtoIn });
  }

  @Get('getVariacionDiariaCompras')
  @ApiOperation({ summary: 'Obtener variación diaria de compras en un rango de fechas' })
  @Auth()
  getVariacionDiariaCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprasDiariasDto) {
    return this.service.getVariacionDiariaCompras({ ...headersParams, ...dtoIn });
  }

  @Get('getTotalComprasPeriodo')
  @ApiOperation({ summary: 'Obtener total de compras por período mensual/anual' })
  @Auth()
  getTotalComprasPeriodo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprasMensualesDto) {
    return this.service.getTotalComprasPeriodo({ ...headersParams, ...dtoIn });
  }

  @Get('getTasaCrecimientoMensualCompras')
  @ApiOperation({ summary: 'Obtener tasa de crecimiento mensual de compras' })
  @Auth()
  getTasaCrecimientoMensualCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComprasMensualesDto) {
    return this.service.getTasaCrecimientoMensualCompras({ ...headersParams, ...dtoIn });
  }

  @Get('getTopProveedores')
  @ApiOperation({ summary: 'Obtener top de proveedores por monto de compras en un período' })
  @Auth()
  getTopProveedores(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProveedoresDto) {
    return this.service.getTopProveedores({ ...headersParams, ...dtoIn });
  }

  @Get('getTopProductosComprados')
  @ApiOperation({ summary: 'Obtener top de productos/artículos comprados en un período' })
  @Auth()
  getTopProductosComprados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProveedoresDto) {
    return this.service.getTopProductosComprados({ ...headersParams, ...dtoIn });
  }

  @Get('getComprasPorCategoriaProducto')
  @ApiOperation({ summary: 'Obtener total de compras agrupado por categoría de producto' })
  @Auth()
  getComprasPorCategoriaProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getComprasPorCategoriaProducto({ ...headersParams, ...dtoIn });
  }

  @Get('getResumenComprasPeriodos')
  @ApiOperation({ summary: 'Obtener resumen comparativo de compras por año' })
  @Auth()
  getResumenComprasPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getResumenComprasPeriodos(headersParams);
  }

  @Get('getComparativoVentasCompras')
  @ApiOperation({ summary: 'Obtener comparativo mensual de Ventas vs Compras en un año' })
  @Auth()
  getComparativoVentasCompras(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComparativoVentasComprasDto) {
    return this.service.getComparativoVentasCompras({ ...headersParams, ...dtoIn });
  }
}
