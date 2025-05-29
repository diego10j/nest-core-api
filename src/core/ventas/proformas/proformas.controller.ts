import { Controller, Get, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { ProformasMensualesDto } from './dto/proformas-mensuales.dto';
import { ProformasDto } from './dto/proformas.dto';
import { ProformasService } from './proformas.service';

@Controller('ventas/proformas')
export class ProformasController {
    constructor(private readonly service: ProformasService) { }


    @Get('getProformas')
    // @Auth()
    getProformas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ProformasDto
    ) {
        return this.service.getProformas({
            ...headersParams,
            ...dtoIn
        });
    }

    // =============================ANALISIS DE DATOS


    @Get('getProformasMensuales')
    // @Auth()
    getProformasMensuales(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ProformasMensualesDto
    ) {
        return this.service.getProformasMensuales({
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


    @Get('getTopProductosMayorUtilidad')
    // @Auth()
    getTopProductosMayorUtilidad(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTopProductosMayorUtilidad({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getEfectividadPorVendedor')
    getEfectividadPorVendedor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getEfectividadPorVendedor({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getTendenciaDiaria')
    getTendenciaDiaria(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTendenciaDiaria({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTopClientes')
    getTopClientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTopClientes({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTiempoConversion')
    getTiempoConversion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getTiempoConversion({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getResumenCotizaciones')
    getResumenCotizaciones(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getResumenCotizaciones({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getVariacionCotizaciones')
    getVariacionCotizaciones(
        @AppHeaders() headersParams: HeaderParamsDto
    ) {
        return this.service.getVariacionCotizaciones(headersParams);
    }



    @Get('getComportamientoClientes')
    getComportamientoClientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getComportamientoClientes({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getCotizacionesPendientes')
    getCotizacionesPendientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getCotizacionesPendientes({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getAnalisisPerdidas')
    getAnalisisPerdidas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getAnalisisPerdidas({
            ...headersParams,
            ...dtoIn
        });
    }
    
    @Get('getEfectividadPorTipo')
    getEfectividadPorTipo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getEfectividadPorTipo({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getHisConversionPorCliente')
    getHisConversionPorCliente(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: RangoFechasDto
    ) {
        return this.service.getHisConversionPorCliente({
            ...headersParams,
            ...dtoIn
        });
    }
    
    
}