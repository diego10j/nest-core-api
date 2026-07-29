import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetNotaCreditoDto } from './dto/get-nota-credito.dto';
import { NotasCreditoRepService } from './notas-credito-rep.service';

@ApiTags('Reports-Ventas')
@Controller('reports/ventas/notas-credito')
export class NotasCreditoRepController {
    constructor(private readonly notasCreditoRepService: NotasCreditoRepService) { }

    @Get('reportNotaCredito')
    @ApiOperation({ summary: 'Generar reporte PDF de la Nota de Crédito electrónica' })
    async reportNotaCredito(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetNotaCreditoDto,
    ) {
        const pdfDoc = await this.notasCreditoRepService.reportNotaCredito({
            ...headersParams,
            ...dtoIn,
        });
        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = 'Nota de Crédito';
        pdfDoc.pipe(response);
        pdfDoc.end();
    }
}
