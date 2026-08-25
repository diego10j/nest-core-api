import { Injectable, NotFoundException } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ComprobanteContabilidadService } from 'src/core/modules/contabilidad/comprobante-contabilidad/comprobante-contabilidad.service';
import { GetComprobanteByIdDto } from 'src/core/modules/contabilidad/comprobante-contabilidad/dto/comprobante-contabilidad.dto';
import { ContabilidadService } from 'src/core/modules/contabilidad/contabilidad.service';
import { EstadosFinancierosDto } from 'src/core/modules/contabilidad/dto/estados-financieros.dto';
import { LibroMayorDto } from 'src/core/modules/contabilidad/dto/libro-mayor.dto';
import { ambienteDesdeClaveAcceso } from 'src/reports/common/ride/ride-report.util';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { SectionsService } from 'src/reports/common/services/sections.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { balanceGeneralReport } from './balance-general.report';
import { comprobanteContabilidadReport } from './comprobante-contabilidad.report';
import { comprobanteRetencionReport } from './comprobante-retencion.report';
import { GetComprobanteRetencionDto } from './dto/get-comprobante-retencion.dto';
import { estadoResultadosReport } from './estado-resultados.report';
import { flujoEfectivoReport } from './flujo-efectivo.report';
import { ComprobanteContabilidadData } from './interfaces/comprobante-contabilidad-rep';
import { ComprobanteRetencionRep, RetencionDetalle } from './interfaces/comprobante-retencion-rep';
import { FlujoEfectivoData } from './interfaces/flujo-efectivo-rep';
import { libroMayorReport } from './libro-mayor.report';

@Injectable()
export class ContabilidadRepService {
  constructor(
    private readonly printerService: PrinterService,
    private readonly contabilidadService: ContabilidadService,
    private readonly comprobanteContabilidadService: ComprobanteContabilidadService,
    private readonly sectionsService: SectionsService,
    private readonly dataSource: DataSourceService,
    private readonly empresaRepService: EmpresaRepService,
  ) { }

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

  async reportFlujoEfectivo(dtoIn: HeaderParamsDto & EstadosFinancierosDto) {
    const result = await this.contabilidadService.getFlujosEfectivo(dtoIn);

    const data = {
      utilidadEjercicio: result.utilidadEjercicio,
      ajustesNoMonetarios: result.ajustesNoMonetarios,
      totalAjustes: result.totalAjustes,
      capitalTrabajo: result.capitalTrabajo,
      totalCapitalTrabajo: result.totalCapitalTrabajo,
      flujoOperacional: result.flujoOperacional,
      flujosInversion: result.flujosInversion,
      flujoInversion: result.flujoInversion,
      flujosFinanciamiento: result.flujosFinanciamiento,
      flujoFinanciamiento: result.flujoFinanciamiento,
      variacionNetaEfectivo: result.variacionNetaEfectivo,
      efectivoInicio: result.efectivoInicio,
      efectivoFin: result.efectivoFin,
      cuentasEfectivo: result.cuentasEfectivo,
      fechaInicio: result.fechaInicio,
      fechaFin: result.fechaFin,
    };

    const header = await this.sectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });

    const docDefinition = flujoEfectivoReport(data, header);
    return this.printerService.createPdf(docDefinition);
  }


  async reportLibroMayor(dtoIn: HeaderParamsDto & LibroMayorDto) {
    const queryCuenta = new SelectQuery(`
      SELECT dpc.ide_cndpc, dpc.codig_recur_cndpc, dpc.nombre_cndpc
      FROM con_det_plan_cuen dpc
      WHERE dpc.ide_cndpc = $1
    `);
    queryCuenta.addIntParam(1, dtoIn.ideCndpc);
    const cuenta = await this.dataSource.createSingleQuery(queryCuenta);
    if (!cuenta) {
      throw new NotFoundException(`Cuenta contable ${dtoIn.ideCndpc} no encontrada`);
    }

    // lazy=false: el reporte necesita TODAS las filas (sin paginación de 100 reg.)
    // y sin COUNT(1) OVER() / esquema que agrega el modo lazy.
    const result = await this.contabilidadService.getLibroMayor({
      ...dtoIn,
      lazy: 'false',
      schema: 'false',
    });

    const movimientos = (result.rows ?? (result as unknown)) as Array<{
      ide_cnccc: number | null;
      fecha_trans_cnccc: string;
      numero_cnccc: string | null;
      beneficiario: string;
      ide_cnlap: number | null;
      debe: number;
      haber: number;
      observacion: string;
      saldo: number;
    }>;

    const data = {
      cuenta,
      movimientos,
      totales: {
        debe: Number(result.row?.debe ?? 0),
        haber: Number(result.row?.haber ?? 0),
        saldo: Number(result.row?.saldo ?? 0),
        saldoInicial: Number(result.row?.saldoInicial ?? 0),
      },
      fechaInicio: dtoIn.fechaInicio,
      fechaFin: dtoIn.fechaFin,
    };

    const header = await this.sectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });

    const docDefinition = libroMayorReport(data, header);
    return this.printerService.createPdf(docDefinition);
  }


  async reportFlujosEfectivo(dtoIn: HeaderParamsDto & EstadosFinancierosDto) {
    const result = await this.contabilidadService.getFlujosEfectivo(dtoIn);
    const data = result as unknown as FlujoEfectivoData;
    const header = await this.sectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });
    const docDefinition = flujoEfectivoReport(data, header);
    return this.printerService.createPdf(docDefinition);
  }

  async reportComprobante(dtoIn: HeaderParamsDto & GetComprobanteByIdDto) {
    const result = await this.comprobanteContabilidadService.getComprobanteById(dtoIn);
    const data = result as unknown as ComprobanteContabilidadData;
    const header = await this.sectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });
    const docDefinition = comprobanteContabilidadReport(data, header);
    return this.printerService.createPdf(docDefinition);
  }

  /** RIDE del comprobante de retención electrónico (Anexo 14 SRI). */
  async reportComprobanteRetencion(dtoIn: HeaderParamsDto & GetComprobanteRetencionDto) {
    const queryCabecera = new SelectQuery(`
      SELECT
        r.ide_cncre, r.numero_cncre, r.fecha_emisi_cncre, r.observacion_cncre,
        p.nom_geper, p.identificac_geper, p.direccion_geper, p.telefono_geper, p.correo_geper,
        doc.numero_cpcfa, doc.fecha_emisi_cpcfa, td.nombre_cntdo,
        s.claveacceso_srcom, s.autorizacion_srcomn, s.fechaautoriza_srcom, s.periodo_fiscal_srcom
      FROM con_cabece_retenc r
      INNER JOIN cxp_cabece_factur doc ON doc.ide_cncre = r.ide_cncre
      INNER JOIN gen_persona p ON doc.ide_geper = p.ide_geper
      INNER JOIN con_tipo_document td ON doc.ide_cntdo = td.ide_cntdo
      LEFT JOIN sri_comprobante s ON r.ide_srcom = s.ide_srcom
      WHERE r.ide_cncre = $1
        AND doc.ide_empr = $2
    `);
    queryCabecera.addIntParam(1, dtoIn.ide_cncre);
    queryCabecera.addIntParam(2, dtoIn.ideEmpr);
    const cabecera = await this.dataSource.createSingleQuery(queryCabecera);
    if (!cabecera) {
      throw new NotFoundException(`Comprobante de retención ${dtoIn.ide_cncre} no encontrado`);
    }

    const queryDetalles = new SelectQuery(`
      SELECT d.ide_cndre, i.nombre_cncim, i.casillero_cncim, d.porcentaje_cndre, d.base_cndre, d.valor_cndre
      FROM con_detall_retenc d
      LEFT JOIN con_cabece_impues i ON d.ide_cncim = i.ide_cncim
      WHERE d.ide_cncre = $1
      ORDER BY d.ide_cndre
    `);
    queryDetalles.addIntParam(1, dtoIn.ide_cncre);
    const detalles = (await this.dataSource.createSelectQuery(queryDetalles)) as RetencionDetalle[];
    const total = detalles.reduce((sum, d) => sum + Number(d.valor_cndre ?? 0), 0);

    const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);
    const ambienteTexto = ambienteDesdeClaveAcceso(cabecera.claveacceso_srcom);

    let barcodeDataUrl: string | undefined;
    if (cabecera.claveacceso_srcom) {
      try {
        const pngBuffer = await bwipjs.toBuffer({
          bcid: 'code128',
          text: cabecera.claveacceso_srcom,
          scale: 2,
          height: 10,
          includetext: false,
        });
        barcodeDataUrl = `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`;
      } catch {
        // Si falla, se omite el barcode sin interrumpir el reporte
      }
    }

    const data: ComprobanteRetencionRep = { cabecera, detalles, total };
    const docDefinition = comprobanteRetencionReport(data, empresa, barcodeDataUrl, ambienteTexto);
    try {
      return this.printerService.createPdf(docDefinition);
    } catch {
      const docFallback = comprobanteRetencionReport(data, empresa, undefined, ambienteTexto);
      return this.printerService.createPdf(docFallback);
    }
  }
}
