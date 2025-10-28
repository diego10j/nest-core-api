import { Controller, Get, Query } from '@nestjs/common';
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



@Controller('inventario/data-bi')
export class InventarioBiController {
    constructor(private readonly service: InventarioBiService,
        private readonly serviceProducto: InventarioProductoBiService) { }

    @Get('getTopProductos')
    // @Auth()
    getTopProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
        return this.service.getTopProductos({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getTopProductosVendidos')
    // @Auth()
    getTopProductosVendidos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
        return this.service.getTopProductosVendidos({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTopProductosFacturados')
    // @Auth()
    getTopProductosFacturados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
        return this.service.getTopProductosFacturados({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTopProductosMayorRotacion')
    // @Auth()
    getTopProductosMayorRotacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
        return this.service.getTopProductosMayorRotacion({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getTopClientesProducto')
    // @Auth()
    getTopClientesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
        return this.service.getTopClientesProducto({
            ...headersParams,
            ...dtoIn,
        });
    }




    @Get('getTotalProductosPorCategoria')
    // @Auth()
    getTotalProductosPorCategoria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getTotalProductosPorCategoria({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTotalVentasProductoPorFormaPago')
    // @Auth()
    getTotalVentasProductoPorFormaPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
        return this.service.getTotalVentasProductoPorFormaPago({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTopVendedoresProducto')
    // @Auth()
    getTopVendedoresProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
        return this.service.getTopVendedoresProducto({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getTotalVentasProductoPorIdCliente')
    // @Auth()
    getTotalVentasProductoPorIdCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
        return this.service.getTotalVentasProductoPorIdCliente({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getProformasMensualesProducto')
    // @Auth()
    getProformasMensualesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
        return this.service.getProformasMensualesProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTotalVentasMensualesProducto')
    // @Auth()
    getTotalVentasMensualesProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
        return this.service.getTotalVentasMensualesProducto({
            ...headersParams,
            ...dtoIn,
        });
    }



    @Get('getVariacionInventarioProducto')
    // @Auth()
    getVariacionInventarioProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisProductoDto) {
        return this.service.getVariacionInventarioProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getComprasMensuales')
    // @Auth()
    getComprasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
        return this.service.getComprasMensuales({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTopProveedoresProducto')
    // @Auth()
    getTopProveedoresProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
        return this.service.getTopProveedoresProducto({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getTendenciaVentasDiaProducto')
    // @Auth()
    getTendenciaVentasDiaProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClientesProductoDto) {
        return this.service.getTendenciaVentasDiaProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getResumenVentasPeriodosProducto')
    // @Auth()
    getResumenVentasPeriodosProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
        return this.service.getResumenVentasPeriodosProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTotalPorTipoTransaccion')
    // @Auth()
    getTotalPorTipoTransaccion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getTotalPorTipoTransaccion({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTotalPorTipoTransaccionProducto')
    // @Auth()
    getTotalPorTipoTransaccionProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getTotalPorTipoTransaccionProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getAnalisisRotacionStockProducto')
    // @Auth()
    getAnalisisRotacionStockProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisProductoDto) {
        return this.serviceProducto.getAnalisisRotacionStockProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getPrediccionStockMensualProducto')
    // @Auth()
    getPrediccionStockMensualProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisProductoDto) {
        return this.serviceProducto.getPrediccionStockMensualProducto({
            ...headersParams,
            ...dtoIn,
        });
    }



    @Get('getAnalisisBodegasMensual')
    // @Auth()
    getAnalisisBodegasMensual(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
        return this.service.getAnalisisBodegasMensual({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getEvaluacionRotacionProducto')
    // @Auth()
    getEvaluacionRotacionProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EvaluacionRotacionProductoDto) {
        return this.serviceProducto.getEvaluacionRotacionProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getProductosStockBajo')
    // @Auth()
    getProductosStockBajo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProductosStockBajoDto) {
        return this.service.getProductosStockBajo({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getProductosMayorStock')
    // @Auth()
    getProductosMayorStock(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProductosMayorStockDto) {
        return this.service.getProductosMayorStock({
            ...headersParams,
            ...dtoIn,
        });
    }




    @Get('getReporteValorInventarioProducto')
    // @Auth()
    getReporteValorInventarioProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
        return this.serviceProducto.getReporteValorInventarioProducto({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getReporteValorInventarioGlobal')
    // @Auth()
    getReporteValorInventarioGlobal(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getReporteValorInventarioGlobal({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getReporteIngresosEgresos')
    // @Auth()
    getReporteIngresosEgresos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getReporteIngresosEgresos({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getReporteIngresosEgresosProducto')
    // @Auth()
    getReporteIngresosEgresosProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getReporteIngresosEgresosProducto({
            ...headersParams,
            ...dtoIn,
        });
    }



    @Get('getAnalisisABCInventario')
    // @Auth()
    getAnalisisABCInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getAnalisisABCInventario({
            ...headersParams,
            ...dtoIn,
        });
    }



    @Get('getRotacionInventario')
    // @Auth()
    getRotacionInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getRotacionInventario({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getStockSeguridadReorden')
    // @Auth()
    getStockSeguridadReorden(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AnalisisDto) {
        return this.service.getStockSeguridadReorden({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getProductosObsoletos')
    // @Auth()
    getProductosObsoletos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProductosObsoletosDto) {
        return this.service.getProductosObsoletos({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTopProductosAjustados')
    // @Auth()
    getTopProductosAjustados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopProductosDto) {
        return this.service.getTopProductosAjustados({
            ...headersParams,
            ...dtoIn,
        });
    }


}
