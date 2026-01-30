import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { BodegaInvReportsService } from './bodega-rep.services';
import { GetDetallesConteoDto } from 'src/core/modules/inventario/bodegas/dto/get-detalles-conteo.dto';



@Controller('reports/inventario/bodega')
export class BodegaInvReportsController {
    constructor(private readonly comprobatesInvReportsService: BodegaInvReportsService) { }

    @Get('reportConteoFisico')
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
