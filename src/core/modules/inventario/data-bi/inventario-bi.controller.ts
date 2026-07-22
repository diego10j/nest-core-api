import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { IdProductoDto } from '../productos/dto/id-producto.dto';
import { TrnProductoDto } from '../productos/dto/trn-producto.dto';
import { VentasMensualesDto } from '../productos/dto/ventas-mensuales.dto';

import { AnalisisProductoDto } from './dto/analisis-producto.dto';
import { AnalisisDto } from './dto/analisis.dto';
import { ClientesProductoDto } from './dto/clientes-producto.dto';
import { EvaluacionRotacionProductoDto } from './dto/evalua-rotacion-producto.dto';
import { ProductosMayorStockDto } from './dto/productos-mayor-stock.dto';
import { ProductosObsoletosDto } from './dto/productos-obsoletos.dto';
import { ProductosStockBajoDto } from './dto/productos-stock-bajo.dto';
import { TopProductosDto } from './dto/top-productos';
import { InventarioBiService } from './inventario-bi.service';
import { InventarioProductoBiService } from './inventario-prod-bi.service';
import { Auth } from 'src/core/auth';

@ApiTags('Inventario-DataBI')
@Controller('inventario/data-bi')
export class InventarioBiController {
  constructor(
    private readonly service: InventarioBiService,
    private readonly serviceProducto: InventarioProductoBiService,
  ) { }

  @Get('getTopProductos')
  @ApiOperation({ summary: 'Obtener top de productos por cantidad de movimientos en un período' })
  @Auth()
  getTopProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
    return this.service.getTopProductos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopProductosVendidos')
  @ApiOperation({ summary: 'Obtener top de productos más vendidos (por cantidad) en un período' })
  @Auth()
  getTopProductosVendidos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
    return this.service.getTopProductosVendidos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopProductosFacturados')
  @ApiOperation({ summary: 'Obtener top de productos más facturados (por monto) en un período' })
  @Auth()
  getTopProductosFacturados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
    return this.service.getTopProductosFacturados({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopProductosMayorRotacion')
  @ApiOperation({ summary: 'Obtener top de productos con mayor rotación de inventario' })
  @Auth()
  getTopProductosMayorRotacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
    return this.service.getTopProductosMayorRotacion({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalProductosPorCategoria')
  @ApiOperation({ summary: 'Obtener total de productos agrupado por categoría' })
  @Auth()
  getTotalProductosPorCategoria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getTotalProductosPorCategoria({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalVentasProductoPorFormaPago')
  @ApiOperation({ summary: 'Obtener ventas de un producto agrupadas por forma de pago' })
  @Auth()
  getTotalVentasProductoPorFormaPago(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: ClientesProductoDto,
  ) {
    return this.service.getTotalVentasProductoPorFormaPago({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopVendedoresProducto')
  @ApiOperation({ summary: 'Obtener top de vendedores de un producto específico' })
  @Auth()
  getTopVendedoresProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
    return this.service.getTopVendedoresProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalVentasProductoPorIdCliente')
  @ApiOperation({ summary: 'Obtener ventas de un producto agrupadas por tipo de identificación de cliente' })
  @Auth()
  getTotalVentasProductoPorIdCliente(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: ClientesProductoDto,
  ) {
    return this.service.getTotalVentasProductoPorIdCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProformasMensualesProducto')
  @ApiOperation({ summary: 'Obtener proformas mensuales de un producto por año' })
  @Auth()
  getProformasMensualesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.service.getProformasMensualesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalVentasMensualesProducto')
  @ApiOperation({ summary: 'Obtener ventas mensuales totales de un producto por año' })
  @Auth()
  getTotalVentasMensualesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.service.getTotalVentasMensualesProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVariacionInventarioProducto')
  @ApiOperation({ summary: 'Obtener variación histórica del inventario de un producto' })
  @Auth()
  getVariacionInventarioProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisProductoDto) {
    return this.service.getVariacionInventarioProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getComprasMensuales')
  @ApiOperation({ summary: 'Obtener compras mensuales de un producto por año' })
  @Auth()
  getComprasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.service.getComprasMensuales({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopProveedoresProducto')
  @ApiOperation({ summary: 'Obtener top de proveedores de un producto específico' })
  @Auth()
  getTopProveedoresProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
    return this.service.getTopProveedoresProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTendenciaVentasDiaProducto')
  @ApiOperation({ summary: 'Obtener tendencia de ventas por día de un producto en un rango de fechas' })
  @Auth()
  getTendenciaVentasDiaProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
    return this.service.getTendenciaVentasDiaProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getResumenVentasPeriodosProducto')
  @ApiOperation({ summary: 'Obtener resumen comparativo de ventas de un producto entre períodos' })
  @Auth()
  getResumenVentasPeriodosProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
    return this.service.getResumenVentasPeriodosProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalPorTipoTransaccion')
  @ApiOperation({ summary: 'Obtener totales de inventario agrupados por tipo de transacción' })
  @Auth()
  getTotalPorTipoTransaccion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getTotalPorTipoTransaccion({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalPorTipoTransaccionProducto')
  @ApiOperation({ summary: 'Obtener totales de un producto agrupados por tipo de transacción' })
  @Auth()
  getTotalPorTipoTransaccionProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getTotalPorTipoTransaccionProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAnalisisRotacionStockProducto')
  @ApiOperation({ summary: 'Obtener análisis de rotación de stock de un producto' })
  @Auth()
  getAnalisisRotacionStockProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisProductoDto) {
    return this.serviceProducto.getAnalisisRotacionStockProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getPrediccionStockMensualProducto')
  @ApiOperation({ summary: 'Obtener predicción de stock mensual de un producto basada en tendencia histórica' })
  @Auth()
  getPrediccionStockMensualProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisProductoDto) {
    return this.serviceProducto.getPrediccionStockMensualProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAnalisisBodegasMensual')
  @ApiOperation({ summary: 'Obtener análisis mensual de movimientos por bodega de un producto' })
  @Auth()
  getAnalisisBodegasMensual(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
    return this.service.getAnalisisBodegasMensual({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEvaluacionRotacionProducto')
  @ApiOperation({ summary: 'Obtener evaluación de rotación de un producto (clasificación A/B/C)' })
  @Auth()
  getEvaluacionRotacionProducto(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: EvaluacionRotacionProductoDto,
  ) {
    return this.serviceProducto.getEvaluacionRotacionProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductosStockBajo')
  @ApiOperation({ summary: 'Obtener productos con stock por debajo del mínimo configurado' })
  @Auth()
  getProductosStockBajo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProductosStockBajoDto) {
    return this.service.getProductosStockBajo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductosMayorStock')
  @ApiOperation({ summary: 'Obtener productos con mayor stock valorizado' })
  @Auth()
  getProductosMayorStock(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProductosMayorStockDto) {
    return this.service.getProductosMayorStock({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReporteValorInventarioProducto')
  @ApiOperation({ summary: 'Obtener reporte de valor de inventario mensual de un producto' })
  @Auth()
  getReporteValorInventarioProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
    return this.serviceProducto.getReporteValorInventarioProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReporteValorInventarioGlobal')
  @ApiOperation({ summary: 'Obtener reporte de valor total del inventario global por período' })
  @Auth()
  getReporteValorInventarioGlobal(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getReporteValorInventarioGlobal({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReporteIngresosEgresos')
  @ApiOperation({ summary: 'Obtener reporte de ingresos y egresos de inventario por período' })
  @Auth()
  getReporteIngresosEgresos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getReporteIngresosEgresos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReporteIngresosEgresosProducto')
  @ApiOperation({ summary: 'Obtener reporte de ingresos y egresos de un producto por período' })
  @Auth()
  getReporteIngresosEgresosProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getReporteIngresosEgresosProducto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getAnalisisABCInventario')
  @ApiOperation({ summary: 'Obtener análisis ABC de inventario por valor acumulado' })
  @Auth()
  getAnalisisABCInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getAnalisisABCInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getRotacionInventario')
  @ApiOperation({ summary: 'Obtener índice de rotación de inventario por producto' })
  @Auth()
  getRotacionInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getRotacionInventario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getStockSeguridadReorden')
  @ApiOperation({ summary: 'Obtener productos que requieren reorden con cálculo de stock de seguridad' })
  @Auth()
  getStockSeguridadReorden(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
    return this.service.getStockSeguridadReorden({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductosObsoletos')
  @ApiOperation({ summary: 'Obtener productos sin movimiento en un período (posiblemente obsoletos)' })
  @Auth()
  getProductosObsoletos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProductosObsoletosDto) {
    return this.service.getProductosObsoletos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTopProductosAjustados')
  @ApiOperation({ summary: 'Obtener top de productos con más ajustes de inventario registrados' })
  @Auth()
  getTopProductosAjustados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
    return this.service.getTopProductosAjustados({
      ...headersParams,
      ...dtoIn,
    });
  }
}
