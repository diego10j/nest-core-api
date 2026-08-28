import { Controller, Get, Param, ParseIntPipe, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ChequeDevueltoSaveService } from './cheque-devuelto-save.service';
import { ChequeDevueltoService } from './cheque-devuelto.service';
import { RegistrarChequeDevueltoDto } from './dto/registrar-cheque-devuelto.dto';

/**
 * Cheques por Cobrar Devueltos: registra un cheque de cliente rechazado por el banco (fondos
 * insuficientes, firma no autorizada, etc.) - reversa el cobro CxC (y el Depósito de Caja si ya
 * estaba cubierto), marca el cheque devuelto, y opcionalmente registra la comisión bancaria +
 * su cargo interno al cliente. Ver ChequeDevueltoSaveService para el detalle del flujo.
 */
@ApiTags('Tesoreria - Cheques Devueltos')
@Controller('tesoreria/cheque-devuelto')
export class ChequeDevueltoController {
    constructor(
        private readonly service: ChequeDevueltoService,
        private readonly saveService: ChequeDevueltoSaveService,
    ) { }

    @Get('getInfoChequeDevuelto/:ideTeclb')
    @ApiOperation({ summary: 'Info de un cheque posfechado para el diálogo de registrar devolución' })
    getInfoChequeDevuelto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTeclb', ParseIntPipe) ideTeclb: number,
    ) {
        return this.service.getInfoChequeDevuelto(ideTeclb, headersParams);
    }

    @Post('registrar')
    @ApiOperation({ summary: 'Registra un cheque de cliente devuelto (reversa el cobro/depósito y opcionalmente cobra la comisión bancaria al cliente)' })
    registrar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RegistrarChequeDevueltoDto,
    ) {
        return this.saveService.registrar({ ...headersParams, ...dtoIn });
    }
}
