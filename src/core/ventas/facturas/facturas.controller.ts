import { Controller, Get, Query } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasDto } from './dto/facturas.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { VentasDiariasDto } from './dto/ventas-diarias.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { VariacionVentasPeriodoDto } from './dto/variacion-periodos.dto';

@Controller('ventas/facturas')
export class FacturasController {
    constructor(private readonly service: FacturasService) { }


    @Get('getPuntosEmisionFacturas')
    // @Auth()
    getPuntosEmisionFacturas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: PuntosEmisionFacturasDto
    ) {
        return this.service.getPuntosEmisionFacturas({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTableQueryPuntosEmisionFacturas')
    // @Auth()
    getTableQueryPuntosEmisionFacturas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: PuntosEmisionFacturasDto
    ) {
        return this.service.getTableQueryPuntosEmisionFacturas({
            ...headersParams,
            ...dtoIn
        });
    }



    @Get('getFacturas')
    // @Auth()
    getFacturas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: FacturasDto
    ) {
        return this.service.getFacturas({
            ...headersParams,
            ...dtoIn
        });
    }

    // ===================================== ANALISIS DE DATOS

    @Get('getTotalFacturasPorEstado')
    // @Auth()
    getTotalFacturasPorEstado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: FacturasDto
    ) {
        return this.service.getTotalFacturasPorEstado({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getTotalVentasPeriodo')
    // @Auth()
    getTotalVentasPeriodo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: VentasMensualesDto
    ) {
        return this.service.getTotalVentasPeriodo({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getVariacionDiariaVentas')
    // @Auth()
    getVariacionDiariaVentas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: VentasDiariasDto
    ) {
        return this.service.getVariacionDiariaVentas({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTendenciaVentasDia')
    // @Auth()
    getTendenciaVentasDia(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTendenciaVentasDia({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTopVendedores')
    // @Auth()
    getTopVendedores(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTopVendedores({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getTotalVentasPorFormaPago')
    // @Auth()
    getTotalVentasPorFormaPago(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTotalVentasPorFormaPago({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTopProductos')
    // @Auth()
    getTopProductos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTopProductos({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTotalVentasPorHora')
    // @Auth()
    getTotalVentasPorHora(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTotalVentasPorHora({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getTopClientes')
    // @Auth()
    getTopClientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTopClientes({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getPromedioVentasPorVendedor')
    // @Auth()
    getPromedioVentasPorVendedor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getPromedioVentasPorVendedor({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getVentasPorCategoriaProducto')
    // @Auth()
    getVentasPorCategoriaProducto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getVentasPorCategoriaProducto({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getVentasPorIdCliente')
    // @Auth()
    getVentasPorIdCliente(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getVentasPorIdCliente({
            ...headersParams,
            ...dtoIn
        });
    }
    

    @Get('getTasaCrecimientoMensual')
    // @Auth()
    getTasaCrecimientoMensual(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTasaCrecimientoMensual({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getFacturasMayorValor')
    // @Auth()
    getFacturasMayorValor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getFacturasMayorValor({
            ...headersParams,
            ...dtoIn
        });
    }
    
   
    @Get('getResumenVentasPeriodos')
    // @Auth()
    getResumenVentasPeriodos(
        @AppHeaders() headersParams: HeaderParamsDto
    ) {
        return this.service.getResumenVentasPeriodos(headersParams);
    } 


  
    @Get('getVariacionVentasPeriodos')
    // @Auth()
    getVariacionVentasPeriodos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: VariacionVentasPeriodoDto
    ) {
        return this.service.getVariacionVentasPeriodos({
            ...headersParams,
            ...dtoIn
        });
    } 


    

    

}
