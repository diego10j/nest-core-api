import { Body, Controller, Post } from '@nestjs/common';

import { CabComprobanteInventarioDto } from '../comprobantes/dto/cab-compr-inv.dto';
import { ComprobantesInvService } from './comprobantes.service';
import { ComprobantesInvDto } from './dto/comprobantes-inv.dto';
import { ServiceDto } from '../../../common/dto/service.dto';

@Controller('inventario/comprobantes')
export class ComprobantesInvController {
    constructor(private readonly service: ComprobantesInvService) { }


    @Post('getComprobantesInventario')
    // @Auth()
    getComprobantesInventario(
        @Body() dtoIn: ComprobantesInvDto
    ) {
        return this.service.getComprobantesInventario(dtoIn);
    }



    @Post('getDetComprobanteInventario')
    // @Auth()
    getDetComprobanteInventario(
        @Body() dtoIn: CabComprobanteInventarioDto
    ) {
        return this.service.getDetComprobanteInventario(dtoIn);
    }


    @Post('getCabComprobanteInventario')
    // @Auth()
    getCabComprobanteInventario(
        @Body() dtoIn: CabComprobanteInventarioDto
    ) {
        return this.service.getCabComprobanteInventario(dtoIn);
    }


    // ==================================ListData==============================
    @Post('getListDataEstadosComprobantes')
    // @Auth()
    getListDataEstadosComprobantes(
        @Body() dtoIn: ServiceDto
    ) {
        return this.service.getListDataEstadosComprobantes(dtoIn);
    }

}




