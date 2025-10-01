import { Controller, Get, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { IdProductoDto } from '../productos/dto/id-producto.dto';
import { TrnProductoDto } from '../productos/dto/trn-producto.dto';
import { VentasMensualesDto } from '../productos/dto/ventas-mensuales.dto';
import { ClientesProductoDto } from './dto/clientes-producto';
import { TopProductosDto } from './dto/top-productos';
import { InventarioBiService } from './inventario-bi.service';



@Controller('inventario/data-bi')
export class InventarioBiController {
    constructor(private readonly service: InventarioBiService) { }

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



    @Get('getVariacionInventario')
    // @Auth()
    getVariacionInventario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
        return this.service.getVariacionInventario({
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

    @Get('getAnalisisTransaccionesTipo')
    // @Auth()
    getAnalisisTransaccionesTipo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
        return this.service.getAnalisisTransaccionesTipo({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getAnalisisRotacionStock')
    // @Auth()
    getAnalisisRotacionStock(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
        return this.service.getAnalisisRotacionStock({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getPrediccionStockMensual')
    // @Auth()
    getPrediccionStockMensual(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProductoDto) {
        return this.service.getPrediccionStockMensual({
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
    getEvaluacionRotacionProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProductoDto) {
        return this.service.getEvaluacionRotacionProducto({
            ...headersParams,
            ...dtoIn,
        });
    }



}
