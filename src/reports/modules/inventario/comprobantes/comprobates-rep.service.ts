import { Injectable, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CabComprobanteInventarioDto } from 'src/core/modules/inventario/comprobantes/dto/cab-compr-inv.dto';


import { PrinterService } from 'src/reports/printer/printer.service';

import { comprobanteInventarioReport } from './comprobante.report';
import { ComprobanteInvRep } from './comprobantes-types';
import { SectionsService } from 'src/reports/common/services/sections.service';

@Injectable()
export class ComprobatesInvReportsService {
  constructor(
    private readonly printerService: PrinterService,
    private readonly dataSource: DataSourceService,
    private readonly SectionsService: SectionsService,
  ) { }

  async reportComprobanteInventario(dtoIn: CabComprobanteInventarioDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
    select
        a.numero_incci,
        a.fecha_trans_incci,
        c.nombre_inbod,
        d.nombre_intti,
        f.nom_geper,
        a.observacion_incci,
        a.ide_cnccc,
        g.nombre_inepi,
        automatico_incci,
        a.usuario_ingre,
        a.fecha_ingre,
        a.hora_ingre,
        signo_intci,
        verifica_incci,
        fecha_verifica_incci, 
        usuario_verifica_incci
    from
        inv_cab_comp_inve a
        inner join inv_bodega c on a.ide_inbod = c.ide_inbod
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join gen_persona f on a.ide_geper = f.ide_geper
        left join inv_est_prev_inve g on a.ide_inepi = g.ide_inepi
        where
        a.ide_incci = $1
        and a.ide_empr = ${dtoIn.ideEmpr}
`,
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
          b.cantidad_indci,
          b.verifica_indci
      from
          inv_det_comp_inve b
          inner join inv_articulo g on b.ide_inarti = g.ide_inarti
      where
          b.ide_incci = $1
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
