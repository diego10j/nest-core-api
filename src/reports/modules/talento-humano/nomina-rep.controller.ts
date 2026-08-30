import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetRolPagosRepDto } from './dto/get-rol-pagos-rep.dto';
import { NominaRepService } from './nomina-rep.service';

@ApiTags('Reportes-Nomina')
@Controller('reports/nomina')
export class NominaRepController {
    constructor(private readonly service: NominaRepService) { }

    @Get('reportRolPagos')
    @ApiOperation({ summary: 'Reporte PDF del rol de pagos (una fila por empleado, columnas iguales al rol físico)' })
    async reportRolPagos(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetRolPagosRepDto,
    ) {
        const pdfDoc = await this.service.reportRolPagos({ ...headersParams, ...dtoIn });
        response.setHeader('Content-Type', 'application/pdf');
        pdfDoc.info.Title = `Rol de Pagos ${dtoIn.ide_nrrol}`;
        pdfDoc.pipe(response);
        pdfDoc.end();
    }
}
