import { Injectable, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CabComprobanteInventarioDto } from 'src/core/modules/inventario/comprobantes/dto/cab-compr-inv.dto';


import { PrinterService } from 'src/reports/printer/printer.service';
import { comprobanteInventarioReport } from './comprobante.report';

@Injectable()
export class ComprobatesInvReportsService {


  constructor(private readonly printerService: PrinterService,
    private readonly dataSource: DataSourceService,
  ) {
  }

  async reportComprobanteInventario(dtoIn: CabComprobanteInventarioDto & HeaderParamsDto) {
    const query = new SelectQuery(`
    select
        a.ide_incci,
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
        verifica_incci,
        fecha_verifica_incci, 
        usuario_verifica_incci,
        f.uuid
    from
        inv_cab_comp_inve a
        inner join inv_bodega c on a.ide_inbod = c.ide_inbod
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join gen_persona f on a.ide_geper = f.ide_geper
        inner join inv_est_prev_inve g on a.ide_inepi = g.ide_inepi
    where
        a.ide_incci = $1
        and a.ide_empr = ${dtoIn.ideEmpr}
`, dtoIn);
    query.addIntParam(1, dtoIn.ide_incci);
    const cabecera = await this.dataSource.createSingleQuery(query);

    if (!cabecera) {
      throw new NotFoundException(`Comprobante ${dtoIn.ide_incci} no existe`);
    }

    const docDefinition = comprobanteInventarioReport({
      data: cabecera as any,
    });

    const doc = this.printerService.createPdf(docDefinition);

    return doc;
  }


}
