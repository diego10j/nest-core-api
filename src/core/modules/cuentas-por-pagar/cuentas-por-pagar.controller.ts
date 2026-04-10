import { Body, Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
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

@Controller('cuentas-por-pagar')
export class CuentasPorPagarController {
    constructor(
        private readonly service: CuentasPorPagarService,
        private readonly saveService: CuentasPorPagarSaveService,
        private readonly ordenService: CuentasPorPagarOrdenService,
    ) { }

    // ─── CONSULTAS CXP ────────────────────────────────────────────────────────

    @Get('getCuentasPorPagar')
    getCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    @Get('getMetricasCuentasPorPagar')
    getMetricasCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getMetricasCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    @Get('getResumenCuentasPorPagar')
    getResumenCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getResumenCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    @Get('getPagosProveedores')
    getPagosProveedores(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FechaCorteDto) {
        return this.service.getPagosProveedores({ ...headersParams, ...dtoIn });
    }

    @Get('getTopCuentasPorPagar')
    getTopCuentasPorPagar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasPorPagarDto) {
        return this.service.getTopCuentasPorPagar({ ...headersParams, ...dtoIn });
    }

    // ─── ÓRDENES DE PAGO — CONSULTAS ─────────────────────────────────────────

    @Get('getSecuencialOrden')
    getSecuencialOrden(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.ordenService.getSecuencialOrden({ ...headersParams, ...dtoIn });
    }

    @Get('getOrdenesPago')
    getOrdenesPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.ordenService.getOrdenesPago({ ...headersParams, ...dtoIn });
    }

    @Get('getOrdenPagoById')
    getOrdenPagoById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdOrdenPagoDto) {
        return this.ordenService.getOrdenPagoById({ ...headersParams, ...dtoIn });
    }

    // Pendiente en el front pantalla
    @Get('getResumenOrdenesPago')
    getResumenOrdenesPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.ordenService.getResumenOrdenesPago({ ...headersParams, ...dtoIn });
    }

    // ─── ÓRDENES DE PAGO — PERSISTENCIA ──────────────────────────────────────

    @Post('saveOrdenPago')
    saveOrdenPago(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveOrdenPagoDto) {
        return this.saveService.saveOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Patch('activarDesactivarOrdenPago')
    activarDesactivarOrdenPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdOrdenPagoDto) {
        return this.saveService.activarDesactivarOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('cambiarEstadoOrdenPago')
    cambiarEstadoOrdenPago(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: { ide_cpcop: number; ide_cpeo: number },
    ) {
        return this.saveService.cambiarEstadoOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('agregarDetallesOrdenPago')
    agregarDetallesOrdenPago(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: { ide_cpcop: number; detalles: SaveOrdenPagoDto['detalles'] },
    ) {
        return this.saveService.agregarDetallesOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('eliminarDetallesOrdenPago')
    eliminarDetallesOrdenPago(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdsDetalleOrdenPagoDto) {
        return this.saveService.eliminarDetallesOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Patch('activarDesactivarDetallesOrdenPago')
    activarDesactivarDetallesOrdenPago(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdsDetalleOrdenPagoDto,
    ) {
        return this.saveService.activarDesactivarDetallesOrdenPago({ ...headersParams, ...dtoIn });
    }

    @Post('saveDetalleOrden')
    saveDetalleOrden(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetallesOrdenDto) {
        return this.saveService.saveDetalleOrden({ ...headersParams, ...dtoIn });
    }
}

