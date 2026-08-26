import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { DepositoCajaSaveService } from './deposito-caja-save.service';
import { DepositoCajaService } from './deposito-caja.service';
import { AnularDepositoCajaDto } from './dto/anular-deposito-caja.dto';
import { CompletarDepositoCajaDto } from './dto/completar-deposito-caja.dto';
import { GenerarDepositoCajaDto } from './dto/generar-deposito-caja.dto';
import { GetDepositosCajaDto } from './dto/get-depositos-caja.dto';
import { GetMovimientosPendientesDepositoDto } from './dto/get-movimientos-pendientes-deposito.dto';

/**
 * Depósitos de Caja: agrupa movimientos de ingreso de una Caja (ventas al contado, cobros, etc.)
 * que todavía no se han llevado físicamente al banco, y registra el depósito real en 2 etapas -
 * Generar (reserva los movimientos elegidos) y Completar (cuando ya se hizo el depósito físico,
 * genera el retiro de caja + el ingreso a banco + el asiento contable). Ver
 * DepositoCajaSaveService para el detalle de cada etapa.
 */
@ApiTags('Tesoreria - Depósitos de Caja')
@Controller('tesoreria/deposito-caja')
export class DepositoCajaController {
    constructor(
        private readonly service: DepositoCajaService,
        private readonly saveService: DepositoCajaSaveService,
    ) { }

    @Get('getMovimientosPendientes')
    @Auth()
    @ApiOperation({ summary: 'Movimientos de ingreso de una caja aún no depositados ni reservados por ningún depósito' })
    getMovimientosPendientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetMovimientosPendientesDepositoDto,
    ) {
        return this.service.getMovimientosPendientes({ ...headersParams, ...dtoIn });
    }

    @Post('generar')
    @Auth()
    @ApiOperation({ summary: 'Genera (reserva) un depósito de caja con los movimientos seleccionados - aún no crea movimientos de banco ni asiento' })
    generar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: GenerarDepositoCajaDto,
    ) {
        return this.saveService.generar({ ...headersParams, ...dtoIn });
    }

    @Post('completar/:ideTedca')
    @Auth()
    @ApiOperation({ summary: 'Completa un depósito de caja ya generado con el comprobante del depósito físico: genera el retiro de caja, el ingreso a banco y el asiento contable' })
    completar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTedca') ideTedca: string,
        @Body() dtoIn: CompletarDepositoCajaDto,
    ) {
        return this.saveService.completar(Number(ideTedca), { ...headersParams, ...dtoIn });
    }

    @Get('getDepositosCaja')
    @Auth()
    @ApiOperation({ summary: 'Listado de Depósitos de Caja ya registrados' })
    getDepositosCaja(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDepositosCajaDto,
    ) {
        return this.service.getDepositosCaja({ ...headersParams, ...dtoIn });
    }

    @Get('getDepositoCajaById/:ideTedca')
    @Auth()
    @ApiOperation({ summary: 'Detalle de un Depósito de Caja (cabecera + movimientos reservados/cubiertos)' })
    getDepositoCajaById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTedca') ideTedca: string,
    ) {
        return this.service.getDepositoCajaById(Number(ideTedca), headersParams);
    }

    @Post('anular/:ideTedca')
    @Auth()
    @ApiOperation({ summary: 'Anula un Depósito de Caja (en cualquier etapa) y libera los movimientos reservados' })
    anular(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTedca') ideTedca: string,
        @Body() dtoIn: AnularDepositoCajaDto,
    ) {
        return this.saveService.anular(Number(ideTedca), { ...headersParams, ...dtoIn });
    }
}
