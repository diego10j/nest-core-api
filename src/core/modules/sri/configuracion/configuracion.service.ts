import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

const EMISOR_COLUMNS = `
    se.ide_sremi,
    se.tipoemision_sremi,
    se.tiempo_espera_sremi,
    se.wsdl_recep_offline_sremi,
    se.wsdl_autori_offline_sremi,
    se.ambiente_sremi,
    se.ide_empr,
    se.ide_sucu,
    su.identicicacion_sucu AS ruc_sucursal,
    su.nom_sucu AS nombre_sucursal
`;

const FIRMA_COLUMNS = `
    sf.ide_srfid,
    sf.ruta_srfid,
    sf.fecha_ingreso_srfid,
    sf.fecha_caduca_srfid,
    sf.nombre_representante_srfid,
    sf.correo_representante_srfid,
    sf.disponible_srfid,
    sf.ide_empr,
    sf.ide_sucu,
    su.nom_sucu AS nombre_sucursal
`;

@Injectable()
export class ConfiguracionService {
    constructor(private readonly dataSource: DataSourceService) { }

    async getEmisor(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT ${EMISOR_COLUMNS}
            FROM sri_emisor se
            LEFT JOIN sis_sucursal su ON se.ide_sucu = su.ide_sucu
            WHERE se.ide_empr = ${dtoIn.ideEmpr}
              AND se.ide_sucu = ${dtoIn.ideSucu}
        `);
        return this.dataSource.createSingleQuery(query);
    }

    async getFirma(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT ${FIRMA_COLUMNS}
            FROM sri_firma_digital sf
            LEFT JOIN sis_sucursal su ON sf.ide_sucu = su.ide_sucu
            WHERE sf.ide_empr = ${dtoIn.ideEmpr}
              AND sf.ide_sucu = ${dtoIn.ideSucu}
              AND sf.disponible_srfid = true
            ORDER BY sf.fecha_ingreso_srfid DESC
            LIMIT 1
        `);
        return this.dataSource.createSingleQuery(query);
    }
}
