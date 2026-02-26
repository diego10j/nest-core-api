import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { GetFacturaDto } from 'src/core/modules/ventas/facturas/dto/get-factura.dto';

import { FacturasRepService } from './facturas-rep.service';

@Controller('reports/ventas/facturas')
export class FacturasRepController {
    constructor(private readonly facturasRepService: FacturasRepService) { }

    @Get('reportFacturaElectronica')
    async getReportFacturaElectronica(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetFacturaDto,
    ) {
        const pdfDoc = await this.facturasRepService.reportFacturaElectronica({
            ...headersParams,
            ...dtoIn,
        });

        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = 'Factura Electrónica';
        pdfDoc.pipe(response);
        pdfDoc.end();
    }
}
