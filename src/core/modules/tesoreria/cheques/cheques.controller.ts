import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ChequesService } from './cheques.service';
import { GetChequesNoConciliadosDto } from './dto/get-cheques-no-conciliados.dto';

@ApiTags('Tesoreria - Cheques')
@Controller('tesoreria/cheques')
export class ChequesController {
    constructor(private readonly service: ChequesService) { }

    @Get('getChequesPosfechadosCxCPendientes')
    @ApiOperation({ summary: 'Listar cheques posfechados por cobrar pendientes' })
    getChequesPosfechadosCxCPendientes(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getChequesPosfechadosCxCPendientes(headersParams);
    }

    @Get('getChequesPosfechadosCxPPendientes')
    @ApiOperation({ summary: 'Listar cheques posfechados por pagar pendientes' })
    getChequesPosfechadosCxPPendientes(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getChequesPosfechadosCxPPendientes(headersParams);
    }

    @Get('getChequesNoConciliados')
    @ApiOperation({ summary: 'Listar cheques no conciliados de una cuenta' })
    getChequesNoConciliados(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetChequesNoConciliadosDto,
    ) {
        return this.service.getChequesNoConciliados({ ...headersParams, ...dtoIn });
    }
}
