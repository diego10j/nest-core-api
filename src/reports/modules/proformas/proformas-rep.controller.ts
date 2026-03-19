import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { GetProformaDto } from 'src/core/modules/proformas/dto/get-proforma.dto';

import { ProformasRepService } from './proformas-rep.service';

@Controller('reports/proformas')
export class ProformasRepController {
    constructor(private readonly proformasRepService: ProformasRepService) { }

    @Get('reportProforma')
    async reportProforma(
        @Res() response: Response,
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetProformaDto,
    ) {
        const buffer = await this.proformasRepService.reportProforma({
            ...headersParams,
            ...dtoIn,
        });

        const filename = `proforma-${dtoIn.ide_cccpr ?? '_proforma'}.pdf`;

        response.setHeader('Content-Type', 'application/pdf');
        response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        response.setHeader('Content-Length', buffer.length);
        response.end(buffer);
    }
}
