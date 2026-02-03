import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { GetDetallesConteoDto } from 'src/core/modules/inventario/bodegas/dto/get-detalles-conteo.dto';
import { SectionsService } from 'src/reports/common/services/sections.service';
import { PrinterService } from 'src/reports/printer/printer.service';


import { conteoFisicoReport } from './bodega-report';
import { ConteoFisicoInvRep } from './interfcaes/bodega-inv-rep';

@Injectable()
export class BodegaInvReportsService {
    constructor(
        private readonly printerService: PrinterService,
        private readonly dataSource: DataSourceService,
        private readonly SectionsService: SectionsService,
    ) { }

    async reportConteoFisico(dtoIn: GetDetallesConteoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
     SELECT
          -- Cabecera del conteo
          cc.ide_inccf,
          cc.secuencial_inccf,
          cc.fecha_corte_inccf,
          cc.fecha_corte_desde_inccf,
          cc.productos_estimados_inccf,
          cc.fecha_ingre,
          -- Bodega
          b.nombre_inbod,
          -- Tipo de conteo
          tc.nombre_intc,
          tc.tolerancia_porcentaje_intc,
          -- Estado
          ec.codigo_inec,
          ec.nombre_inec,
          -- Detalles de artículos
          d.ide_indcf,
          a.codigo_inarti,
          a.nombre_inarti,
          ca.nombre_incate,
          a.decim_stock_inarti,
          u.siglas_inuni,
          d.saldo_corte_indcf,
          d.cantidad_fisica_indcf,
          -- Reconteo (si aplica)
          d.cantidad_reconteo_indcf,
          d.observacion_indcf,
          us.nom_usua
      FROM inv_cab_conteo_fisico cc
      INNER JOIN inv_bodega b ON cc.ide_inbod = b.ide_inbod
      INNER JOIN inv_tipo_conteo tc ON cc.ide_intc = tc.ide_intc
      INNER JOIN inv_estado_conteo ec ON cc.ide_inec = ec.ide_inec
      INNER JOIN inv_det_conteo_fisico d ON cc.ide_inccf = d.ide_inccf
      INNER JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
      LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
      LEFT JOIN inv_categoria ca ON a.ide_incate = ca.ide_incate
      LEFT JOIN sis_usuario us on cc.ide_usua= us.ide_usua
      WHERE cc.ide_inccf = $1
          AND cc.activo_inccf = true
          AND d.activo_indcf = true
      ORDER BY 
          ca.nombre_incate,a.nombre_inarti
    `,
        );

        query.addIntParam(1, dtoIn.ide_inccf);
        const detalles = await this.dataSource.createSelectQuery(query) as ConteoFisicoInvRep[];
        const header = await this.SectionsService.createReportHeader({ ideEmpr: dtoIn.ideEmpr });

        const docDefinition = conteoFisicoReport(detalles, header);

        const doc = this.printerService.createPdf(docDefinition);

        return doc;
    }
}
