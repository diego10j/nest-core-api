import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';

@Injectable()
export class ClientesService {

    constructor(private readonly dataSource: DataSourceService
    ) {
    }

    async getClientes() {
        const query = new SelectQuery(`SELECT
        ide_geper,
        p.uuid,
        nom_geper,
        identificac_geper,
        codigo_geper,
        correo_geper,
        fecha_ingre_geper,
        nombre_cndfp,
        nombre_vgven
    FROM
        gen_persona p
        left join con_deta_forma_pago b on b.ide_cndfp= p.ide_cndfp   
        left join ven_vendedor c on c.ide_vgven=p.ide_vgven
    WHERE es_cliente_geper = true
         and identificac_geper is not null
         and nivel_geper = 'HIJO'
    ORDER BY
        p.nom_geper`);

        return await this.dataSource.createQueryPG(query);
    }


}
