import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetGuiaRemisionDto } from './dto/get-guia-remision.dto';
import { GuiasRemisionRepService } from './guias-remision-rep.service';

@ApiTags('Reports-Ventas')
@Controller('reports/ventas/guias-remision')
export class GuiasRemisionRepController {
    constructor(private readonly guiasRemisionRepService: GuiasRemisionRepService) { }

    @Get('reportGuiaRemision')
    @ApiOperation({ summary: 'Generar reporte PDF de la Guía de Remisión' })
    async reportGuiaRemision(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetGuiaRemisionDto,
    ) {
        const pdfDoc = await this.guiasRemisionRepService.reportGuiaRemision({
            ...headersParams,
            ...dtoIn,
        });
        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = 'Guía de Remisión';
        pdfDoc.pipe(response);
        pdfDoc.end();
    }
}
