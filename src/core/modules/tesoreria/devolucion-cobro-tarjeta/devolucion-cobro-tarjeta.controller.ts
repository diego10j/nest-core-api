import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { DevolucionCobroTarjetaSaveService } from './devolucion-cobro-tarjeta-save.service';
import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';
import { AnularDevolucionTarjetaDto } from './dto/anular-devolucion-tarjeta.dto';
import { FinalizarDevolucionTarjetaDto } from './dto/finalizar-devolucion-tarjeta.dto';
import { GetDevolucionesTarjetaDto } from './dto/get-devoluciones-tarjeta.dto';
import { GetFacturasTarjetaPendientesDto } from './dto/get-facturas-tarjeta-pendientes.dto';
import { GetReporteCobrosTarjetaDto } from './dto/get-reporte-cobros-tarjeta.dto';

/**
 * Devolución de Cobros con Tarjeta: liquida el ciclo de un cobro con tarjeta (factura de venta
 * -> comisión del procesador -> retención SRI opcional -> transferencia del neto), reutilizando
 * los flujos ya existentes de Compras/Ventas/Tesorería. El parseo de XML (factura de comisión y
 * retención) y el OCR del comprobante de transferencia usan los endpoints YA existentes de esos
 * módulos (cuentas-por-pagar/documentos/importarXML, ventas/facturas/retenciones/importarXML,
 * tesoreria/procesarImagenTransferencia, tesoreria/comprobante-banco/uploadComprobante) - este
 * controlador solo expone la consulta de facturas pendientes y el cierre atómico del ciclo.
 */
@ApiTags('Tesoreria - Devolución Cobros Tarjeta')
@Controller('tesoreria/devolucion-cobro-tarjeta')
export class DevolucionCobroTarjetaController {
    constructor(
        private readonly service: DevolucionCobroTarjetaService,
        private readonly saveService: DevolucionCobroTarjetaSaveService,
    ) { }

    @Get('getFacturasTarjetaPendientes')
    @Auth()
    @ApiOperation({ summary: 'Facturas de venta cobradas con una cuenta de tarjeta aún no cubiertas por ninguna devolución' })
    getFacturasTarjetaPendientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetFacturasTarjetaPendientesDto,
    ) {
        return this.service.getFacturasTarjetaPendientes({ ...headersParams, ...dtoIn });
    }

    @Get('getRetencionIdPorFactura/:ideCccfa')
    @Auth()
    @ApiOperation({ summary: 'ide_cncre de una factura de venta, si tiene retención registrada' })
    getRetencionIdPorFactura(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideCccfa') ideCccfa: string,
    ) {
        return this.service.getRetencionIdPorFactura(Number(ideCccfa), headersParams);
    }

    @Post('finalizar')
    @Auth()
    @ApiOperation({ summary: 'Ejecuta el ciclo completo de la devolución de cobros con tarjeta (pago comisión, retención, transferencia del neto y trazabilidad) en una sola operación atómica' })
    finalizar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: FinalizarDevolucionTarjetaDto,
    ) {
        return this.saveService.finalizar({ ...headersParams, ...dtoIn });
    }

    @Get('getDevolucionesTarjeta')
    @Auth()
    @ApiOperation({ summary: 'Listado de ciclos de Devolución de Cobros con Tarjeta ya registrados' })
    getDevolucionesTarjeta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDevolucionesTarjetaDto,
    ) {
        return this.service.getDevolucionesTarjeta({ ...headersParams, ...dtoIn });
    }

    @Get('getDevolucionTarjetaById/:ideTecdt')
    @Auth()
    @ApiOperation({ summary: 'Detalle de un ciclo de Devolución de Cobros con Tarjeta (cabecera + facturas cubiertas)' })
    getDevolucionTarjetaById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTecdt') ideTecdt: string,
    ) {
        return this.service.getDevolucionTarjetaById(Number(ideTecdt), headersParams);
    }

    @Get('getReporteCobrosTarjeta')
    @Auth()
    @ApiOperation({ summary: 'Reporte de todas las facturas de venta cobradas con tarjeta (liquidadas o no), con comisión/retención/neto prorrateados y diferencias' })
    getReporteCobrosTarjeta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetReporteCobrosTarjetaDto,
    ) {
        return this.service.getReporteCobrosTarjeta({ ...headersParams, ...dtoIn });
    }

    @Post('anular/:ideTecdt')
    @Auth()
    @ApiOperation({ summary: 'Anula un ciclo de Devolución de Cobros con Tarjeta para permitir reingresarlo' })
    anular(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTecdt') ideTecdt: string,
        @Body() dtoIn: AnularDevolucionTarjetaDto,
    ) {
        return this.saveService.anular(Number(ideTecdt), { ...headersParams, ...dtoIn });
    }
}
