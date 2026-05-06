import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { GetDetallesConteoDto } from 'src/core/modules/inventario/bodegas/dto/get-detalles-conteo.dto';

import { BodegaInvReportsService } from './bodega-rep.services';

@ApiTags('Reports-Inventario')
@Controller('reports/inventario/bodega')
export class BodegaInvReportsController {
    constructor(private readonly comprobatesInvReportsService: BodegaInvReportsService) { }

    @Get('reportConteoFisico')
    @ApiOperation({ summary: 'Generar reporte PDF de conteo físico de bodega' })
    async getOrderReport(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDetallesConteoDto,
    ) {
        const pdfDoc = await this.comprobatesInvReportsService.reportConteoFisico({
            ...headersParams,
            ...dtoIn,
        });

        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = 'Reporte de Conteo Físico de Bodega';
        pdfDoc.pipe(response);
        pdfDoc.end();
    }
}
