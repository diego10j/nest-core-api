import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { BaseService } from '../../../common/base-service';
import { ServiceDto } from '../../../common/dto/service.dto';


@Injectable()
export class ClientesService extends BaseService {


    constructor(private readonly dataSource: DataSourceService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_cxc_estado_factura_normal'  // 0
        ]).then(result => {
            this.variables = result;
        });
    }

    async getClientes(dtoIn: ServiceDto) {
        const query = new SelectQuery(`
        WITH saldo_cte AS (
            SELECT
                ide_geper,
                SUM(valor_ccdtr * signo_ccttr) AS saldo,
                MAX(ct.fecha_trans_ccctr) AS ultima_transaccion
            FROM
                cxc_detall_transa dt
                LEFT JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
                LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            GROUP BY
                ide_geper
        )
        SELECT
            p.ide_geper,
            p.uuid,
            p.nom_geper,
            p.identificac_geper,
            p.codigo_geper,
            p.correo_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            c.nombre_vgven,
            ultima_transaccion,
            COALESCE(s.saldo, 0) AS saldo,
            activo_geper
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN ven_vendedor c ON c.ide_vgven = p.ide_vgven
            LEFT JOIN saldo_cte s ON s.ide_geper = p.ide_geper
        WHERE
            p.es_cliente_geper = true
            AND p.identificac_geper IS NOT NULL
            AND p.nivel_geper = 'HIJO'
        ORDER BY
            p.nom_geper
        `
            , dtoIn);

        return await this.dataSource.createQueryPG(query);
    }


}
