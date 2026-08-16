import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { ReporteVentasMensualesDto } from '../facturas/dto/reporte-ventas-mensuales.dto';

/** Estado "normal" de cxp_cabecera_nota.ide_cpeno (paridad con notas-credito-save.service.ts) */
const IDE_CPENO_NORMAL = 1;

/**
 * Servicio de consultas para notas de crédito de VENTAS (cxp_cabecera_nota, pese al
 * prefijo "cxp_" son de CxC — ver nota en notas-credito-save.service.ts).
 */
@Injectable()
export class NotasCreditoService extends BaseService {
    constructor(private readonly dataSource: DataSourceService) {
        super();
    }

    /**
     * Retorna las notas de crédito de VENTAS sin asiento contable en un mes/período
     * (para el proceso de generación de asientos / Mayorizar)
     */
    async getNotasNoContabilizadas(dtoIn: ReporteVentasMensualesDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT a.ide_cpcno,
                   a.numero_cpcno,
                   a.fecha_emisi_cpcno,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcno AS ventas12,
                   a.base_tarifa0_cpcno + a.base_no_objeto_iva_cpcno AS ventas0,
                   a.valor_iva_cpcno,
                   a.total_cpcno,
                   a.num_doc_mod_cpcno,
                   a.observacion_cpcno,
                   a.fecha_trans_cpcno,
                   a.ide_geper
            FROM cxp_cabecera_nota a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            WHERE EXTRACT(MONTH FROM a.fecha_emisi_cpcno) = $1
              AND EXTRACT(YEAR FROM a.fecha_emisi_cpcno) = $2
              AND a.ide_sucu = $3
              AND a.ide_cpeno = ${IDE_CPENO_NORMAL}
              AND a.ide_cnccc IS NULL
            ORDER BY a.numero_cpcno DESC, a.ide_cpcno DESC
        `);
        query.addIntParam(1, dtoIn.mes);
        query.addIntParam(2, dtoIn.periodo);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }
}
