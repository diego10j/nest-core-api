import { Body, Controller, Post } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasDto } from './dto/facturas.dto';

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



}
