import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { CabComprobanteInventarioDto } from 'src/core/modules/inventario/comprobantes/dto/cab-compr-inv.dto';

import { ComprobatesInvReportsService } from './comprobates-rep.service';

@Controller('reports/inventario/comprobantes')
export class ComprobatesInvReportsController {
  constructor(private readonly comprobatesInvReportsService: ComprobatesInvReportsService) { }

  @Get('reportComprobanteInventario')
  async getOrderReport(
    @Res() response: Response,
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CabComprobanteInventarioDto,
  ) {
    const pdfDoc = await this.comprobatesInvReportsService.reportComprobanteInventario({
      ...headersParams,
      ...dtoIn,
    });

    response.setHeader('Content-Type', 'application/pdf');
    pdfDoc.info.Title = 'Reporte de Comprobante de Inventario';
    pdfDoc.pipe(response);
    pdfDoc.end();
  }
}
