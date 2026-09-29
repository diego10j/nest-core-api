import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { PeriodoInventarioDto } from './dto/periodo-inventario.dto';
import { InventarioDashboardService } from './inventario-dashboard.service';

@ApiTags('Inventario-Dashboard')
@Controller('inventario/dashboard')
export class InventarioDashboardController {
  constructor(private readonly service: InventarioDashboardService) {}

  @Get('getKpisInventario')
  @ApiOperation({
    summary: 'Totales del dashboard de inventario: valor (kardex PPMP), entradas/salidas del mes, rotación y días de inventario',
  })
  @Auth()
  getKpisInventario(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getKpisInventario(headersParams);
  }

  @Get('getValorInventarioMensual')
  @ApiOperation({ summary: 'Valor del inventario al cierre de cada mes del año, con entradas y salidas a costo' })
  @Auth()
  getValorInventarioMensual(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoInventarioDto) {
    return this.service.getValorInventarioMensual({ ...headersParams, ...dtoIn });
  }

  @Get('getMovimientosPorTipo')
  @ApiOperation({ summary: 'Movimientos del año por tipo de transacción (comprobantes y valor a costo)' })
  @Auth()
  getMovimientosPorTipo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoInventarioDto) {
    return this.service.getMovimientosPorTipo({ ...headersParams, ...dtoIn });
  }

  @Get('getRotacionCategorias')
  @ApiOperation({ summary: 'Rotación, días de inventario y valor inmóvil por categoría' })
  @Auth()
  getRotacionCategorias(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getRotacionCategorias(headersParams);
  }

  @Get('getResumenAbc')
  @ApiOperation({ summary: 'Resumen de la clasificación ABC del inventario y los 30 productos más valiosos (Pareto)' })
  @Auth()
  getResumenAbc(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getResumenAbc(headersParams);
  }

  @Get('getAbcInventarioTabla')
  @ApiOperation({ summary: 'Productos con existencia y su clasificación ABC (DataTableQuery)' })
  @Auth()
  getAbcInventarioTabla(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoInventarioDto) {
    return this.service.getAbcInventarioTabla({ ...headersParams, ...dtoIn });
  }
}
