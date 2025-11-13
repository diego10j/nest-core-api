import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { VariacionVentasPeriodoDto } from '../facturas/dto/variacion-periodos.dto';
import { VentasDiariasDto } from '../facturas/dto/ventas-diarias.dto';
import { VentasMensualesDto } from '../facturas/dto/ventas-mensuales.dto';
import { TopClientesDto } from './dto/top-clientes.dto';


import { VentasBiService } from './ventas-bi.service';

@Controller('ventas/data-bi')
export class VentasBiController {
    constructor(private readonly service: VentasBiService) { }



    @Get('getTotalVentasPeriodo')
    // @Auth()
    getTotalVentasPeriodo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
        return this.service.getTotalVentasPeriodo({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getVariacionDiariaVentas')
    // @Auth()
    getVariacionDiariaVentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasDiariasDto) {
        return this.service.getVariacionDiariaVentas({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTendenciaVentasDia')
    // @Auth()
    getTendenciaVentasDia(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getTendenciaVentasDia({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTopVendedores')
    // @Auth()
    getTopVendedores(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getTopVendedores({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTotalVentasPorFormaPago')
    // @Auth()
    getTotalVentasPorFormaPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getTotalVentasPorFormaPago({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getTotalVentasPorHora')
    // @Auth()
    getTotalVentasPorHora(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getTotalVentasPorHora({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTopClientes')
    // @Auth()
    getTopClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
        return this.service.getTopClientes({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getVentasPorCategoriaProducto')
    // @Auth()
    getVentasPorCategoriaProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getVentasPorCategoriaProducto({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getVentasPorIdCliente')
    // @Auth()
    getVentasPorIdCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getVentasPorIdCliente({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTasaCrecimientoMensual')
    // @Auth()
    getTasaCrecimientoMensual(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesDto) {
        return this.service.getTasaCrecimientoMensual({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getFacturasMayorValor')
    // @Auth()
    getFacturasMayorValor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
        return this.service.getFacturasMayorValor({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getResumenVentasPeriodos')
    // @Auth()
    getResumenVentasPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getResumenVentasPeriodos(headersParams);
    }

    @Get('getVariacionVentasPeriodos')
    // @Auth()
    getVariacionVentasPeriodos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VariacionVentasPeriodoDto) {
        return this.service.getVariacionVentasPeriodos({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getVentasPorDiaDelMes')
    // @Auth()
    getVentasPorDiaDelMes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getVentasPorDiaDelMes({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getKPIsVentas')
    // @Auth()
    getKPIsVentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getKPIsVentas({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getProductosMasRentables')
    // @Auth()
    getProductosMasRentables(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
        return this.service.getProductosMasRentables({
            ...headersParams,
            ...dtoIn,
        });
    }


    @Get('getTotalClientesPorProvincia')
    // @Auth()
    getTotalClientesPorProvincia(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getTotalClientesPorProvincia(headersParams);
    }


    @Get('getTopClientesFacturas')
    // @Auth()
    getTopClientesFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopClientesDto) {
        return this.service.getTopClientesFacturas({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getTotalClientesPorPeriodo')
    // @Auth()
    getTotalClientesPorPeriodo(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getTotalClientesPorPeriodo(headersParams);
    }

    @Get('getTotalClientesPorPeriodoVendedor')
    // @Auth()
    getTotalClientesPorPeriodoVendedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
        return this.service.getTotalClientesPorPeriodoVendedor({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getResumenClientesPorVendedor')
    // @Auth()
    getResumenClientesPorVendedor(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getResumenClientesPorVendedor(headersParams);
    }





}
