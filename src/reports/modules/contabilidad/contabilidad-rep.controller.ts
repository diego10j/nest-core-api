import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { GetComprobanteByIdDto } from 'src/core/modules/contabilidad/comprobante-contabilidad/dto/comprobante-contabilidad.dto';
import { EstadosFinancierosDto } from 'src/core/modules/contabilidad/dto/estados-financieros.dto';

import { ContabilidadRepService } from './contabilidad-rep.service';

@ApiTags('Reports-Contabilidad')
@Controller('reports/contabilidad')
export class ContabilidadRepController {
  constructor(private readonly contabilidadRepService: ContabilidadRepService) { }

  @Get('reportBalanceGeneral')
  @ApiOperation({ summary: 'Generar reporte PDF del Balance General' })
  async reportBalanceGeneral(
    @Res() response: Response,
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: EstadosFinancierosDto,
  ) {
    const pdfDoc = await this.contabilidadRepService.reportBalanceGeneral({
      ...headersParams,
      ...dtoIn,
    });
    response.setHeader('Content-Type', 'application/pdf');
    pdfDoc.info.Title = 'Balance General';
    pdfDoc.pipe(response);
    pdfDoc.end();
  }

  @Get('reportEstadoResultados')
  @ApiOperation({ summary: 'Generar reporte PDF del Estado de Resultados' })
  async reportEstadoResultados(
    @Res() response: Response,
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: EstadosFinancierosDto,
  ) {
    const pdfDoc = await this.contabilidadRepService.reportEstadoResultados({
      ...headersParams,
      ...dtoIn,
    });
    response.setHeader('Content-Type', 'application/pdf');
    pdfDoc.info.Title = 'Estado de Resultados';
    pdfDoc.pipe(response);
    pdfDoc.end();
  }

  @Get('reportFlujoEfectivo')
  @ApiOperation({ summary: 'Generar reporte PDF del Estado de Flujo de Efectivo (NIC 7 — Método Indirecto)' })
  async reportFlujoEfectivo(
    @Res() response: Response,
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: EstadosFinancierosDto,
  ) {
    const pdfDoc = await this.contabilidadRepService.reportFlujoEfectivo({
      ...headersParams,
      ...dtoIn,
    });
    response.setHeader('Content-Type', 'application/pdf');
    pdfDoc.info.Title = 'Estado de Flujo de Efectivo';
    pdfDoc.pipe(response);
    pdfDoc.end();
  }

  @Get('reportComprobante')
  @ApiOperation({ summary: 'Generar reporte PDF del Comprobante de Contabilidad' })
  async reportComprobante(
    @Res() response: Response,
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetComprobanteByIdDto,
  ) {
    const pdfDoc = await this.contabilidadRepService.reportComprobante({
      ...headersParams,
      ...dtoIn,
    });
    response.setHeader('Content-Type', 'application/pdf');
    pdfDoc.info.Title = 'Comprobante de Contabilidad';
    pdfDoc.pipe(response);
    pdfDoc.end();
  }
}


