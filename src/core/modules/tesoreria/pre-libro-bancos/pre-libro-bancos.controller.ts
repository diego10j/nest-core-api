import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { AnularMovimientoDto } from './dto/anular-movimiento.dto';
import { ConciliarMovimientosDto } from './dto/conciliar-movimientos.dto';
import { ExisteNumTransaccionDto } from './dto/existe-num-transaccion.dto';
import { GetDetalleTransaccionDto } from './dto/get-detalle-transaccion.dto';
import { GetSaldoCuentaDto } from './dto/get-saldo-cuenta.dto';
import { GetTransaccionesCuentaDto } from './dto/get-transacciones-cuenta.dto';
import { GetPosicionConsolidadaDto } from './dto/posicion-consolidada.dto';
import { ReversarTransaccionDto } from './dto/reversar-transaccion.dto';
import { SaveDepositoCajaDto } from './dto/save-deposito-caja.dto';
import { SaveLibroBancoDto } from './dto/save-libro-banco.dto';
import { SaveTransferenciaDto } from './dto/save-transferencia.dto';
import { PreLibroBancosConciliacionService } from './pre-libro-bancos-conciliacion.service';
import { PreLibroBancosSaveService } from './pre-libro-bancos-save.service';
import { PreLibroBancosService } from './pre-libro-bancos.service';

@ApiTags('Tesoreria - Pre Libro Bancos')
@Controller('tesoreria/pre-libro-bancos')
export class PreLibroBancosController {
    constructor(
        private readonly service: PreLibroBancosService,
        private readonly saveService: PreLibroBancosSaveService,
        private readonly conciliacionService: PreLibroBancosConciliacionService,
    ) { }

    // ─── CONSULTAS ────────────────────────────────────────────────────────────────

    @Get('getTransaccionesCuenta')
    @ApiOperation({ summary: 'Listar transacciones de una cuenta en rango de fechas' })
    getTransaccionesCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetTransaccionesCuentaDto,
    ) {
        return this.service.getTransaccionesCuenta({ ...headersParams, ...dtoIn });
    }

    @Get('getTransaccionesCuentaNoConciliado')
    @ApiOperation({ summary: 'Listar transacciones NO conciliadas de una cuenta' })
    getTransaccionesCuentaNoConciliado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetTransaccionesCuentaDto,
    ) {
        return this.service.getTransaccionesCuentaNoConciliado({ ...headersParams, ...dtoIn });
    }

    @Get('getDetalleTransaccion')
    @ApiOperation({ summary: 'Obtener detalle completo de una transaccion de tesoreria' })
    getDetalleTransaccion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDetalleTransaccionDto,
    ) {
        return this.service.getDetalleTransaccion({ ...headersParams, ...dtoIn });
    }

    @Get('getSaldoInicialCuenta')
    @ApiOperation({ summary: 'Obtener saldo inicial de una cuenta a una fecha' })
    getSaldoInicialCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetSaldoCuentaDto,
    ) {
        return this.service.getSaldoInicialCuenta({ ...headersParams, ...dtoIn });
    }

    @Get('getSaldoCuenta')
    @ApiOperation({ summary: 'Obtener saldo total de una cuenta' })
    getSaldoCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetSaldoCuentaDto,
    ) {
        return this.service.getSaldoCuenta({ ...headersParams, ...dtoIn });
    }

    @Get('existeNumTransaccion')
    @ApiOperation({ summary: 'Validar si ya existe un numero de transaccion' })
    existeNumTransaccion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ExisteNumTransaccionDto,
    ) {
        return this.service.existeNumTransaccion({ ...headersParams, ...dtoIn });
    }

    @Get('getComboTipoIdentificacion')
    @ApiOperation({ summary: 'Listar tipos de identificacion para combos' })
    getComboTipoIdentificacion(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getComboTipoIdentificacion();
    }

    @Get('getComboBeneficiario')
    @ApiOperation({ summary: 'Listar beneficiarios para combos' })
    getComboBeneficiario(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getComboBeneficiario();
    }

    // ─── MUTACIONES ───────────────────────────────────────────────────────────────

    @Post('anularMovimiento')
    @ApiOperation({ summary: 'Anular un movimiento del libro bancos' })
    anularMovimiento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularMovimientoDto,
    ) {
        return this.saveService.anularMovimiento({ ...headersParams, ...dtoIn });
    }

    @Post('reversarTransaccion')
    @ApiOperation({ summary: 'Reversar una transaccion creando un movimiento inverso' })
    reversarTransaccion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ReversarTransaccionDto,
    ) {
        return this.saveService.reversarTransaccion({ ...headersParams, ...dtoIn });
    }

    @Post('reversarChequeDevuelto')
    @ApiOperation({ summary: 'Reversar un cheque devuelto (tipo 15)' })
    reversarChequeDevuelto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ReversarTransaccionDto & { valor?: number },
    ) {
        return this.saveService.reversarChequeDevuelto({ ...headersParams, ...dtoIn });
    }

    @Post('generarLibroBanco')
    @ApiOperation({ summary: 'Generar un movimiento en el libro bancos' })
    generarLibroBanco(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveLibroBancoDto,
    ) {
        return this.saveService.generarLibroBanco({ ...headersParams, ...dtoIn });
    }

    @Post('generarLibroBancoOtros')
    @ApiOperation({ summary: 'Generar movimiento en libro bancos para otras transacciones' })
    generarLibroBancoOtros(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveLibroBancoDto & { numComprobante?: string },
    ) {
        return this.saveService.generarLibroBancoOtros({ ...headersParams, ...dtoIn });
    }

    @Post('generarTransferencia')
    @ApiOperation({ summary: 'Generar transferencia entre cuentas (retiro + ingreso)' })
    generarTransferencia(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveTransferenciaDto,
    ) {
        return this.saveService.generarTransferencia({ ...headersParams, ...dtoIn });
    }

    @Post('generarDepositoCaja')
    @ApiOperation({ summary: 'Generar deposito de caja a banco (retiro caja + ingreso banco)' })
    generarDepositoCaja(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveDepositoCajaDto,
    ) {
        return this.saveService.generarDepositoCaja({ ...headersParams, ...dtoIn });
    }

    @Post('generarTransaccion')
    @ApiOperation({ summary: 'Generar una transaccion generica en el libro bancos' })
    generarTransaccion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: {
            ideTecba: number; ideTettb: number; valor: number;
            observacion?: string; numero?: string;
            fechaTransaccion?: string; beneficiario?: string;
        },
    ) {
        return this.saveService.generarTransaccion({ ...headersParams, ...dtoIn });
    }

    @Post('crearBeneficiario')
    @ApiOperation({ summary: 'Crear un beneficiario en gen_persona' })
    crearBeneficiario(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: { identificacion: string; ideGetid: number; nombre: string },
    ) {
        return this.saveService.crearBeneficiario({ ...headersParams, ...dtoIn });
    }

    // ─── CONCILIACION ─────────────────────────────────────────────────────────────

    @Get('getTransaccionesConciliarCuenta')
    @ApiOperation({ summary: 'Listar transacciones disponibles para conciliar' })
    getTransaccionesConciliarCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: { ideTecba: number; fechaInicio: string; fechaFin: string },
    ) {
        return this.conciliacionService.getTransaccionesConciliarCuenta({ ...headersParams, ...dtoIn });
    }

    @Post('conciliarMovimientos')
    @ApiOperation({ summary: 'Marcar movimientos como conciliados' })
    conciliarMovimientos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ConciliarMovimientosDto,
    ) {
        return this.conciliacionService.conciliarMovimientos({ ...headersParams, ...dtoIn });
    }

    @Get('getSaldoInicialConciliadoCuenta')
    @ApiOperation({ summary: 'Obtener saldo inicial conciliado de una cuenta a una fecha' })
    getSaldoInicialConciliadoCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetSaldoCuentaDto,
    ) {
        return this.conciliacionService.getSaldoInicialConciliadoCuenta(dtoIn.ideTecba, dtoIn.fecha ?? getCurrentDate());
    }

    @Get('getSaldoInicialEstadoCuenta')
    @ApiOperation({ summary: 'Obtener saldo inicial del estado de cuenta' })
    getSaldoInicialEstadoCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetSaldoCuentaDto,
    ) {
        return this.conciliacionService.getSaldoInicialEstadoCuenta(dtoIn.ideTecba, dtoIn.fecha ?? getCurrentDate());
    }

    @Get('getPosicionConsolidada')
    @ApiOperation({ summary: 'Obtener posicion consolidada de cuentas bancarias' })
    getPosicionConsolidada(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetPosicionConsolidadaDto,
    ) {
        return this.conciliacionService.getPosicionConsolidada({ ...headersParams, ...dtoIn });
    }
}
