import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';

@Injectable()
export class ProductosService {

    constructor(private readonly dataSource: DataSourceService
    ) {
    }



    async getProductos() {

        const query = new SelectQuery(`SELECT
        ide_inarti,
        uuid,
        nombre_inarti,
        codigo_inarti,
        nombre_inuni,
        foto_inarti,
        (
            select
                sum (cantidad_indci * signo_intci)
            from
                inv_det_comp_inve dci
                left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
                left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
                left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
            where
                dci.ide_inarti = ARTICULO.ide_inarti
                and ide_inepi = 1 -- -- " + utilitario.getVariable(" p_inv_estado_normal ") + "
            GROUP BY
                dci.ide_inarti
        ) AS existencia,
        (
            select
                precio_cpdfa
            from
                cxp_detall_factur
                inner join cxp_cabece_factur on cxp_detall_factur.ide_cpcfa = cxp_cabece_factur.ide_cpcfa
            where
                ide_cpefa = 0
                and ide_inarti = ARTICULO.ide_inarti
            order by
                fecha_emisi_cpcfa desc
            limit
                1
        ) AS ultimo_precio_compra,
        activo_inarti
    FROM
        inv_articulo ARTICULO
        LEFT JOIN inv_unidad UNIDAD ON ARTICULO.ide_inuni = UNIDAD.ide_inuni
        LEFT JOIN inv_marca m on ARTICULO.ide_inmar = m.ide_inmar
    WHERE
        ide_intpr = 1 ---solo productos
        and nivel_inarti = 'HIJO'
    ORDER BY
        ARTICULO.nombre_inarti`);

        return await this.dataSource.createQueryPG(query);
    }


}
