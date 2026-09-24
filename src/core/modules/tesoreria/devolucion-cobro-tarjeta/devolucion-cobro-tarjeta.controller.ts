import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { CorteTarjetaSaveService } from './corte-tarjeta-save.service';
import { DevolucionCobroTarjetaSaveService } from './devolucion-cobro-tarjeta-save.service';
import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';
import { AnularDevolucionTarjetaDto } from './dto/anular-devolucion-tarjeta.dto';
import { GetDevolucionesTarjetaDto } from './dto/get-devoluciones-tarjeta.dto';
import {
    GetFacturasTarjetaPendientesDto,
    GetLiquidacionesRegistradasDto,
} from './dto/get-facturas-tarjeta-pendientes.dto';
import { GetReporteCobrosTarjetaDto } from './dto/get-reporte-cobros-tarjeta.dto';
import { RegistrarAcreditacionTarjetaDto } from './dto/registrar-acreditacion-tarjeta.dto';
import { RegistrarCorteTarjetaDto } from './dto/registrar-corte-tarjeta.dto';

/**
 * Cobros con tarjeta de un procesador (ej. Bendo): dos registros independientes que se hacen cuando
 * llega cada documento, en cualquier orden - la ACREDITACIÓN (transferencia del neto de 1..N pagos,
 * con el Excel de liquidación y el comprobante bancario) y el CORTE (factura de comisión y/o
 * comprobante de retención sobre un conjunto de pagos). El parseo del XML de comisión y de
 * retención y el OCR del comprobante usan los endpoints YA existentes de Compras/Ventas/Tesorería.
 */
@ApiTags('Tesoreria - Cobros con Tarjeta')
@Controller('tesoreria/devolucion-cobro-tarjeta')
export class DevolucionCobroTarjetaController {
    constructor(
        private readonly service: DevolucionCobroTarjetaService,
        private readonly saveService: DevolucionCobroTarjetaSaveService,
        private readonly corteService: CorteTarjetaSaveService,
    ) { }

    @Get('getFacturasTarjetaPendientes')
    @Auth()
    @ApiOperation({ summary: 'Pagos (facturas de venta cobradas con una cuenta de tarjeta) que aún tienen algo por registrar: su acreditación o su corte (comisión/retención)' })
    getFacturasTarjetaPendientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetFacturasTarjetaPendientesDto,
    ) {
        return this.service.getFacturasTarjetaPendientes({ ...headersParams, ...dtoIn });
    }

    @Get('getLiquidacionesRegistradas')
    @Auth()
    @ApiOperation({ summary: 'Indica cuáles números de liquidación del procesador (separados por coma) ya tienen una acreditación vigente' })
    getLiquidacionesRegistradas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetLiquidacionesRegistradasDto,
    ) {
        const numeros = dtoIn.numeros.split(',').map((n) => n.trim()).filter(Boolean);
        return this.service.getLiquidacionesRegistradas(numeros, headersParams);
    }

    @Post('registrarAcreditacion')
    @Auth()
    @ApiOperation({ summary: 'Registra una acreditación del procesador de tarjeta: transfiere el neto de 1..N pagos a la cuenta destino y guarda los valores de su liquidación' })
    registrarAcreditacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RegistrarAcreditacionTarjetaDto,
    ) {
        return this.saveService.registrarAcreditacion({ ...headersParams, ...dtoIn });
    }

    @Post('registrarCorte')
    @Auth()
    @ApiOperation({ summary: 'Registra un corte del procesador de tarjeta: factura de comisión y/o comprobante de retención sobre un conjunto de pagos, contabilizados contra la cuenta de tarjeta' })
    registrarCorte(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RegistrarCorteTarjetaDto,
    ) {
        return this.corteService.registrarCorte({ ...headersParams, ...dtoIn });
    }

    @Get('getDevolucionesTarjeta')
    @Auth()
    @ApiOperation({ summary: 'Listado unificado de acreditaciones y cortes de cobros con tarjeta' })
    getDevolucionesTarjeta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDevolucionesTarjetaDto,
    ) {
        return this.service.getDevolucionesTarjeta({ ...headersParams, ...dtoIn });
    }

    @Get('getDevolucionTarjetaById/:ideTecdt')
    @Auth()
    @ApiOperation({ summary: 'Detalle de una acreditación (cabecera + pagos cubiertos con los valores del procesador)' })
    getDevolucionTarjetaById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTecdt') ideTecdt: string,
    ) {
        return this.service.getDevolucionTarjetaById(Number(ideTecdt), headersParams);
    }

    @Get('getCorteTarjetaById/:ideTecct')
    @Auth()
    @ApiOperation({ summary: 'Detalle de un corte (documentos, pagos que cubre y conciliación contra la liquidación del procesador)' })
    getCorteTarjetaById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTecct') ideTecct: string,
    ) {
        return this.service.getCorteTarjetaById(Number(ideTecct), headersParams);
    }

    @Get('getReporteCobrosTarjeta')
    @Auth()
    @ApiOperation({ summary: 'Tablero de pagos con tarjeta: cada factura con sus marcas de acreditación, comisión y retención, y los valores del procesador' })
    getReporteCobrosTarjeta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetReporteCobrosTarjetaDto,
    ) {
        return this.service.getReporteCobrosTarjeta({ ...headersParams, ...dtoIn });
    }

    @Post('anular/:ideTecdt')
    @Auth()
    @ApiOperation({ summary: 'Anula una acreditación para permitir reingresarla' })
    anular(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTecdt') ideTecdt: string,
        @Body() dtoIn: AnularDevolucionTarjetaDto,
    ) {
        return this.saveService.anular(Number(ideTecdt), { ...headersParams, ...dtoIn });
    }

    @Post('anularCorte/:ideTecct')
    @Auth()
    @ApiOperation({ summary: 'Anula un corte (reversa la retención y el pago de la comisión) para permitir registrarlo de nuevo' })
    anularCorte(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTecct') ideTecct: string,
        @Body() dtoIn: AnularDevolucionTarjetaDto,
    ) {
        return this.corteService.anularCorte(Number(ideTecct), { ...headersParams, ...dtoIn });
    }
}
