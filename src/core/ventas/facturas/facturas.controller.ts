import { Controller, Get, Query } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasDto } from './dto/facturas.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { VentasDiariasDto } from './dto/ventas-diarias.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

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

    @Get('getTotalUltimasVentasDiarias')
    // @Auth()
    getTotalUltimasVentasDiarias(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: VentasDiariasDto
    ) {
        return this.service.getTotalUltimasVentasDiarias({
            ...headersParams,
            ...dtoIn
        });
    }




}
