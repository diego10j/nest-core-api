import { Query, Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CabComprobanteInventarioDto } from '../comprobantes/dto/cab-compr-inv.dto';
import { ComprobantesInvService } from './comprobantes.service';
import { ComprobantesInvDto } from './dto/comprobantes-inv.dto';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
@ApiTags('Inventario-Comprobantes')
@Controller('inventario/comprobantes')
export class ComprobantesInvController {
    constructor(private readonly service: ComprobantesInvService) { }


    @Get('getComprobantesInventario')
    // @Auth()
    getComprobantesInventario(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ComprobantesInvDto
    ) {
        return this.service.getComprobantesInventario({
            ...headersParams,
            ...dtoIn
        });
    }



    @Get('getDetComprobanteInventario')
    // @Auth()
    getDetComprobanteInventario(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: CabComprobanteInventarioDto
    ) {
        return this.service.getDetComprobanteInventario({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getCabComprobanteInventario')
    // @Auth()
    getCabComprobanteInventario(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: CabComprobanteInventarioDto
    ) {
        return this.service.getCabComprobanteInventario({
            ...headersParams,
            ...dtoIn
        });
    }


    // ==================================ListData==============================
    @Get('getListDataEstadosComprobantes')
    // @Auth()
    getListDataEstadosComprobantes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto
    ) {
        return this.service.getListDataEstadosComprobantes({
            ...headersParams,
            ...dtoIn
        });
    }

}




