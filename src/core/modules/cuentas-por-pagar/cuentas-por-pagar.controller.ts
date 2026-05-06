import { Body, Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { FechaCorteDto } from './dto/fecha-corte-cxp.dto';
import { TopCuentasPorPagarDto } from './dto/top-cxp.dto';
import { IdOrdenPagoDto, IdsDetalleOrdenPagoDto } from './dto/id-orden-pago.dto';
import { SaveDetalleOrdenDto, SaveDetallesOrdenDto, SaveOrdenPagoDto } from './dto/save-orden-pago.dto';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { CuentasPorPagarSaveService } from './cuentas-por-pagar-save.service';
import { CuentasPorPagarOrdenService } from './cuentas-por-pagar-orden.service';
import { CuentasPorPagarDto } from './dto/cuentas-por-pagar.dto';

@ApiTags('CuentasPorPagar')
@Controller('cuentas-por-pagar')
export class CuentasPorPagarController {
    constructor(
        private readonly service: CuentasPorPagarService,
        private readonly saveService: CuentasPorPagarSaveService,
        private readonly ordenService: CuentasPorPagarOrdenService,
    ) { }

    // ─── CONSULTAS CXP ────────────────────────────────────────────────────────

    @Get('getCuentasPorPagar')
    @ApiOperation({ summary: 'Listar cuentas por pagar con filtros' })
    getCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CuentasPorPagarDto) {
        return this.service.getCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    @Get('getMetricasCuentasPorPagar')
    @ApiOperation({ summary: 'Obtener métricas de cuentas por pagar (totales, vencidas, próximas)' })
    getMetricasCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getMetricasCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    @Get('getResumenCuentasPorPagar')
    @ApiOperation({ summary: 'Obtener resumen de cuentas por pagar agrupado por antigüedad' })
    getResumenCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getResumenCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    @Get('getPagosProveedores')
    @ApiOperation({ summary: 'Listar pagos realizados a proveedores a una fecha de corte' })
    getPagosProveedores(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FechaCorteDto) {
        return this.service.getPagosProveedores({ ...headersParams, ...dtoIn });
    }

    @Get('getTopCuentasPorPagar')
    @ApiOperation({ summary: 'Obtener top de proveedores con mayor deuda pendiente' })
    getTopCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasPorPagarDto) {
        return this.service.getTopCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    // ─── ÓRDENES DE PAGO — CONSULTAS ─────────────────────────────────────────

    @Get('getSecuencialOrden')
    @ApiOperation({ summary: 'Obtener siguiente secuencial para una orden de pago' })
    getSecuencialOrden(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.ordenService.getSecuencialOrden({ ...headersParams, ...dtoIn });
    }

    @Get('getOrdenesPago')
    @ApiOperation({ summary: 'Listar órdenes de pago por rango de fechas' })
    getOrdenesPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.ordenService.getOrdenesPago({ ...headersParams, ...dtoIn });
    }

    @Get('getOrdenPagoById')
    @ApiOperation({ summary: 'Obtener detalle completo de una orden de pago por ID' })
    getOrdenPagoById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdOrdenPagoDto) {
        return this.ordenService.getOrdenPagoById({ ...headersParams, ...dtoIn });
    }

    // Pendiente en el front pantalla
    @Get('getResumenOrdenesPago')
    @ApiOperation({ summary: 'Obtener resumen de órdenes de pago por período' })
    getResumenOrdenesPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.ordenService.getResumenOrdenesPago({ ...headersParams, ...dtoIn });
    }

    // ─── ÓRDENES DE PAGO — PERSISTENCIA ──────────────────────────────────────

    @Post('saveOrdenPago')
    @ApiOperation({ summary: 'Crear o actualizar una orden de pago con sus detalles' })
    saveOrdenPago(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveOrdenPagoDto) {
        return this.saveService.saveOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Patch('activarDesactivarOrdenPago')
    @ApiOperation({ summary: 'Activar o desactivar una orden de pago' })
    activarDesactivarOrdenPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdOrdenPagoDto) {
        return this.saveService.activarDesactivarOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('cambiarEstadoOrdenPago')
    @ApiOperation({ summary: 'Cambiar el estado de una orden de pago (pendiente, aprobada, pagada)' })
    cambiarEstadoOrdenPago(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: { ide_cpcop: number; ide_cpeo: number },
    ) {
        return this.saveService.cambiarEstadoOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('agregarDetallesOrdenPago')
    @ApiOperation({ summary: 'Agregar líneas de detalle a una orden de pago existente' })
    agregarDetallesOrdenPago(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: { ide_cpcop: number; detalles: SaveOrdenPagoDto['detalles'] },
    ) {
        return this.saveService.agregarDetallesOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('eliminarDetallesOrdenPago')
    @ApiOperation({ summary: 'Eliminar líneas de detalle de una orden de pago' })
    eliminarDetallesOrdenPago(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdsDetalleOrdenPagoDto) {
        return this.saveService.eliminarDetallesOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Patch('activarDesactivarDetallesOrdenPago')
    @ApiOperation({ summary: 'Activar o desactivar detalles de una orden de pago' })
    activarDesactivarDetallesOrdenPago(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdsDetalleOrdenPagoDto,
    ) {
        return this.saveService.activarDesactivarDetallesOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('saveDetalleOrden')
    @ApiOperation({ summary: 'Guardar o actualizar detalle de una orden de pago' })
    saveDetalleOrden(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetallesOrdenDto) {
        return this.saveService.saveDetalleOrden({ ...headersParams, ...dtoIn });
    }

    @Get('getReporteCxPDetallado')
    @ApiOperation({ summary: 'Obtener reporte detallado de cuentas por pagar' })
    getReporteCxPDetallado(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getReporteCxPDetallado({ ...headersParams, ...dtoIn });
    }
}

