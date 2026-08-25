import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ReporteComprasMensualesDto } from 'src/core/modules/cuentas-por-pagar/dto/reporte-compras-mensuales.dto';

import { CuentasPorPagarRepService } from './cuentas-por-pagar-rep.service';
import { GetLiquidacionCompraDto } from './dto/get-liquidacion-compra.dto';
import { GetOrdenPagoDto } from './dto/get-orden-pago.dto';

@ApiTags('Reports-CuentasPorPagar')
@Controller('reports/cuentas-por-pagar')
export class CuentasPorPagarRepController {
    constructor(private readonly cuentasPorPagarRepService: CuentasPorPagarRepService) { }

    @Get('reportLiquidacionCompra')
    @ApiOperation({ summary: 'Generar reporte PDF de la Liquidación de Compra electrónica' })
    async reportLiquidacionCompra(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetLiquidacionCompraDto,
    ) {
        const pdfDoc = await this.cuentasPorPagarRepService.reportLiquidacionCompra({
            ...headersParams,
            ...dtoIn,
        });
        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = 'Liquidación de Compra';
        pdfDoc.pipe(response);
        pdfDoc.end();
    }

    @Get('reportOrdenPago')
    @ApiOperation({ summary: 'Generar reporte PDF de la Orden de Pago' })
    async reportOrdenPago(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetOrdenPagoDto,
    ) {
        const pdfDoc = await this.cuentasPorPagarRepService.reportOrdenPago({
            ...headersParams,
            ...dtoIn,
        });
        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = 'Orden de Pago';
        pdfDoc.pipe(response);
        pdfDoc.end();
    }

    @Get('reportIvaCompras')
    @ApiOperation({ summary: 'Generar reporte PDF "IVA en Compras" (facturas + notas de crédito de un mes/año)' })
    async getReportIvaCompras(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ReporteComprasMensualesDto,
    ) {
        const pdfDoc = await this.cuentasPorPagarRepService.reportIvaCompras({
            ...headersParams,
            ...dtoIn,
        });

        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = 'IVA en Compras';
        pdfDoc.pipe(response);
        pdfDoc.end();
    }
}
