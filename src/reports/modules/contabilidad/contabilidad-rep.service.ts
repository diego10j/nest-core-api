import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { EstadosFinancierosDto } from 'src/core/modules/contabilidad/dto/estados-financieros.dto';
import { ContabilidadService } from 'src/core/modules/contabilidad/contabilidad.service';
import { SectionsService } from 'src/reports/common/services/sections.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { balanceGeneralReport } from './balance-general.report';
import { estadoResultadosReport } from './estado-resultados.report';

@Injectable()
export class ContabilidadRepService {
  constructor(
    private readonly printerService: PrinterService,
    private readonly contabilidadService: ContabilidadService,
    private readonly sectionsService: SectionsService,
  ) {}

  async reportBalanceGeneral(dtoIn: HeaderParamsDto & EstadosFinancierosDto) {
    const result = await this.contabilidadService.getBalanceGeneral(dtoIn);

    const cuentas = (result.rows ?? result) as Array<{
      ide_cndpc: number;
      con_ide_cndpc: number | null;
      codig_recur_cndpc: string;
      nombre_cndpc: string;
      nivel: number;
      ide_cntcu: number;
      valor: number;
    }>;

    const totalesPorTipo = (result.row?.totalesPorTipo?.rows ?? result.row?.totalesPorTipo ?? []) as Array<{
      ide_cntcu: number;
      nombre_cntcu: string;
      total: number;
    }>;

    const data = {
      cuentas,
      totalesPorTipo,
      fechaInicio: dtoIn.fechaInicio,
      fechaFin: dtoIn.fechaFin,
    };

    const header = await this.sectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });

    const docDefinition = balanceGeneralReport(data, header);
    return this.printerService.createPdf(docDefinition);
  }

  async reportEstadoResultados(dtoIn: HeaderParamsDto & EstadosFinancierosDto) {
    const result = await this.contabilidadService.getEstadoResultados(dtoIn);

    const cuentas = (result.rows ?? result) as Array<{
      ide_cndpc: number;
      con_ide_cndpc: number | null;
      codig_recur_cndpc: string;
      nombre_cndpc: string;
      nivel: number;
      ide_cntcu: number;
      valor: number;
    }>;

    const totalesPorTipo = (result.row?.totalesPorTipo?.rows ?? result.row?.totalesPorTipo ?? []) as Array<{
      ide_cntcu: number;
      nombre_cntcu: string;
      total: number;
    }>;

    const data = {
      cuentas,
      totalesPorTipo,
      totalIngresos: Number(result.row?.totalIngresos ?? 0),
      totalCostos: Number(result.row?.totalCostos ?? 0),
      totalGastos: Number(result.row?.totalGastos ?? 0),
      utilidadNeta: Number(result.row?.utilidadNeta ?? 0),
      fechaInicio: dtoIn.fechaInicio,
      fechaFin: dtoIn.fechaFin,
    };

    const header = await this.sectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });

    const docDefinition = estadoResultadosReport(data, header);
    return this.printerService.createPdf(docDefinition);
  }
}
