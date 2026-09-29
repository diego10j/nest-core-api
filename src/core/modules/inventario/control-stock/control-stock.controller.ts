import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { ControlStockService } from './control-stock.service';
import { GetControlStockDto } from './dto/get-control-stock.dto';

@ApiTags('Inventario-ControlStock')
@Controller('inventario/control-stock')
export class ControlStockController {
  constructor(private readonly service: ControlStockService) {}

  @Get('getDashboardStock')
  @ApiOperation({
    summary:
      'Tarjetas y datos del dashboard de stock: valor, productos por estado, valor por categoría, más stock, alertas y stock inmóvil',
  })
  @Auth()
  getDashboardStock(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetControlStockDto) {
    return this.service.getDashboardStock({ ...headersParams, ...dtoIn });
  }

  @Get('getProductosStock')
  @ApiOperation({
    summary:
      'Productos con su stock (DataTableQuery) según la vista: alertas de stock bajo, más stock, stock inmóvil o reporte por categoría',
  })
  @Auth()
  getProductosStock(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetControlStockDto) {
    return this.service.getProductosStock({ ...headersParams, ...dtoIn });
  }
}
