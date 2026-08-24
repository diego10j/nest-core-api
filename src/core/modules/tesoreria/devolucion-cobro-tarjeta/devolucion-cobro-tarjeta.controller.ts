import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { DevolucionCobroTarjetaSaveService } from './devolucion-cobro-tarjeta-save.service';
import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';
import { FinalizarDevolucionTarjetaDto } from './dto/finalizar-devolucion-tarjeta.dto';
import { GetFacturasTarjetaPendientesDto } from './dto/get-facturas-tarjeta-pendientes.dto';

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
}
