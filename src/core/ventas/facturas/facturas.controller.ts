import { Body, Controller, Post } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasDto } from './dto/facturas.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { VentasDiariasDto } from './dto/ventas-diarias.dto';

@Controller('ventas/facturas')
export class FacturasController {
    constructor(private readonly service: FacturasService) { }


    @Post('getPuntosEmisionFacturas')
    // @Auth()
    getPuntosEmisionFacturas(
        @Body() dtoIn: PuntosEmisionFacturasDto
    ) {
        return this.service.getPuntosEmisionFacturas(dtoIn);
    }

    @Post('getTableQueryPuntosEmisionFacturas')
    // @Auth()
    getTableQueryPuntosEmisionFacturas(
        @Body() dtoIn: PuntosEmisionFacturasDto
    ) {
        return this.service.getTableQueryPuntosEmisionFacturas(dtoIn);
    }



    @Post('getFacturas')
    // @Auth()
    getFacturas(
        @Body() dtoIn: FacturasDto
    ) {
        return this.service.getFacturas(dtoIn);
    }


    @Post('getTotalFacturasPorEstado')
    // @Auth()
    getTotalFacturasPorEstado(
        @Body() dtoIn: FacturasDto
    ) {
        return this.service.getTotalFacturasPorEstado(dtoIn);
    }


    @Post('getTotalVentasPeriodo')
    // @Auth()
    getTotalVentasPeriodo(
        @Body() dtoIn: VentasMensualesDto
    ) {
        return this.service.getTotalVentasPeriodo(dtoIn);
    }

    @Post('getTotalUltimasVentasDiarias')
    // @Auth()
    getTotalUltimasVentasDiarias(
        @Body() dtoIn: VentasDiariasDto
    ) {
        return this.service.getTotalUltimasVentasDiarias(dtoIn);
    }




}
