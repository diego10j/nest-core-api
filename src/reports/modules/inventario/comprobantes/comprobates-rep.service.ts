import { Injectable, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CabComprobanteInventarioDto } from 'src/core/modules/inventario/comprobantes/dto/cab-compr-inv.dto';

import { PrinterService } from 'src/reports/printer/printer.service';

import { comprobanteInventarioReport } from './comprobante.report';
import { ComprobanteInvRep } from './interfaces/comprobante-inv-rep';
import { SectionsService } from 'src/reports/common/services/sections.service';

@Injectable()
export class ComprobatesInvReportsService {
  constructor(
    private readonly printerService: PrinterService,
    private readonly dataSource: DataSourceService,
    private readonly SectionsService: SectionsService,
  ) {}

  async reportComprobanteInventario(dtoIn: CabComprobanteInventarioDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
    SELECT
          a.numero_incci,
          a.fecha_trans_incci,
          c.nombre_inbod,
          d.nombre_intti,
          f.nom_geper,
          a.observacion_incci,
          a.ide_cnccc,
          g.nombre_inepi,
          a.automatico_incci,
          a.usuario_ingre,
          a.fecha_ingre,
          a.hora_ingre,
          e.signo_intci,
          a.verifica_incci,
          a.fecha_verifica_incci, 
          a.usuario_verifica_incci,
          COALESCE(
              (
                  SELECT MAX(cccfa.secuencial_cccfa)
                  FROM cxc_cabece_factura cccfa
                  INNER JOIN inv_det_comp_inve det ON cccfa.ide_cccfa = det.ide_cccfa
                  WHERE det.ide_incci = a.ide_incci
              ),
              (
                  SELECT MAX(cpcfa.numero_cpcfa)
                  FROM cxp_cabece_factur cpcfa
                  INNER JOIN inv_det_comp_inve det ON cpcfa.ide_cpcfa = det.ide_cpcfa
                  WHERE det.ide_incci = a.ide_incci
              )
          ) AS num_documento
      FROM inv_cab_comp_inve a
      INNER JOIN inv_bodega c ON a.ide_inbod = c.ide_inbod
      INNER JOIN inv_tip_tran_inve d ON a.ide_intti = d.ide_intti
      INNER JOIN inv_tip_comp_inve e ON d.ide_intci = e.ide_intci
      INNER JOIN gen_persona f ON a.ide_geper = f.ide_geper
      LEFT JOIN inv_est_prev_inve g ON a.ide_inepi = g.ide_inepi
      WHERE a.ide_incci = $1
          AND a.ide_empr = ${dtoIn.ideEmpr};`,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_incci);
    const cabecera = await this.dataSource.createSingleQuery(query);

    if (!cabecera) {
      throw new NotFoundException(`Comprobante ${dtoIn.ide_incci} no existe`);
    }

    const queryDet = new SelectQuery(
      `
      select
          g.nombre_inarti,
          precio_indci,
          valor_indci,
          b.observacion_indci,
          f_decimales (b.cantidad_indci) AS cantidad_indci, 
          b.verifica_indci,
          siglas_inuni,
          observ_verifica_indci
      from
          inv_det_comp_inve b
          inner join inv_articulo g on b.ide_inarti = g.ide_inarti
          LEFT JOIN inv_unidad h ON g.ide_inuni = h.ide_inuni
      where
          b.ide_incci = $1
          and g.hace_kardex_inarti = true
      order by  g.nombre_inarti
    `,
      dtoIn,
    );

    queryDet.addIntParam(1, dtoIn.ide_incci);
    const detalles = await this.dataSource.createSelectQuery(queryDet);

    const comprobante = {
      cabecera: cabecera,
      detalles: detalles,
    } as ComprobanteInvRep;

    const header = await this.SectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });

    const docDefinition = comprobanteInventarioReport(comprobante, header);

    const doc = this.printerService.createPdf(docDefinition);

    return doc;
  }
}
