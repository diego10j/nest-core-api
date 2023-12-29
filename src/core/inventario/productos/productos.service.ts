import { ResultQuery } from './../../connection/interfaces/resultQuery';
import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { TrnProductoDto } from './dto/trn-producto.dto';
import { ComprasProductoDto } from './dto/compras-producto.dto';

@Injectable()
export class ProductosService {

    private variables = new Map();

    constructor(private readonly dataSource: DataSourceService
    ) {
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_inv_estado_normal',  // 1
            'p_cxp_estado_factura_normal', // 1
            'p_parx'
        ]).then(result => {
            this.variables = result;
        });

    }

    async getProductos() {

        const query = new SelectQuery(`SELECT
        ide_inarti,
        uuid,
        nombre_inarti,
        codigo_inarti,
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
                and ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
            GROUP BY
                dci.ide_inarti
        ) AS existencia,
        nombre_inuni,
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
        ) AS precio_compra,
        (
            select
                fecha_emisi_cpcfa
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
        ) AS fecha_compra,
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


    async getTrnProducto(dtoIn: TrnProductoDto) {

        const query = new SelectQuery(`
    SELECT
        dci.ide_indci,
        cci.ide_incci,
        cci.fecha_trans_incci,
        nombre_intti,        
        COALESCE(
            (
                select
                    secuencial_cccfa
                from
                    cxc_cabece_factura
                where
                    ide_cccfa = dci.ide_cccfa
            ),
            (
                select
                    numero_cpcfa
                from
                    cxp_cabece_factur
                where
                    ide_cpcfa = dci.ide_cpcfa
            )
        ) as NUM_DOCUMENTO,
        nom_geper,
        case
            when signo_intci = 1 THEN cantidad_indci
        end as INGRESO,
        case
            when signo_intci = -1 THEN cantidad_indci
        end as EGRESO,
        precio_indci as PRECIO,
        '' as SALDO
    FROM
        inv_det_comp_inve dci
        left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
        left join gen_persona gpe on cci.ide_geper = gpe.ide_geper
        left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
        left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
        left join inv_articulo arti on dci.ide_inarti = arti.ide_inarti
    WHERE
        dci.ide_inarti = $1
        AND fecha_trans_incci BETWEEN $2 AND $3
        AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
    ORDER BY cci.fecha_trans_incci asc,dci.ide_indci asc,signo_intci asc`);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        const res: ResultQuery = await this.dataSource.createQueryPG(query);
        // Calcula saldos
        const saldoInicial: number = await this.getSaldoInicial(dtoIn.ide_inarti, dtoIn.fechaInicio);
        let saldoCalcula: number = saldoInicial;
        res.rows.forEach(row => {
            const { ingreso, egreso } = row;
            saldoCalcula = saldoCalcula + Number(ingreso) - Number(egreso);
            row.saldo = saldoCalcula;
        });
        if (saldoInicial !== 0) {
            res.rows.unshift({
                "ide_indci": 0,
                "ide_incci": null,
                "fecha_trans_incci": this.dataSource.util.DATE_UTIL.getDateFormatFront(dtoIn.fechaInicio),
                "nombre_intti": "Saldo Inicial",
                "nom_geper": `SALDO INICIAL AL ${this.dataSource.util.DATE_UTIL.getDateFormatFront(dtoIn.fechaInicio)}`,
                "num_documento": null,
                "ingreso": null,
                "egreso": null,
                "precio": null,
                "saldo": saldoInicial
            });
            res.rowCount = res.rowCount + 1;
        }

        return res;


    }


    async getComprasProducto(dtoIn: ComprasProductoDto) {
        const query = new SelectQuery(`
    SELECT
        cdf.ide_cpdfa,
        cf.fecha_emisi_cpcfa,
        numero_cpcfa,
        nom_geper,
        cdf.cantidad_cpdfa,
        cdf.precio_cpdfa,
        cdf.valor_cpdfa
    FROM
        cxp_detall_factur cdf
        left join cxp_cabece_factur cf on cf.ide_cpcfa = cdf.ide_cpcfa
        left join inv_articulo iart on iart.ide_inarti = cdf.ide_inarti
        left join gen_persona p on cf.ide_geper = p.ide_geper
    WHERE
        cdf.ide_inarti =  $1
        and cf.ide_cpefa =  ${this.variables.get('p_cxp_estado_factura_normal')} 
        and cf.fecha_emisi_cpcfa BETWEEN $2 AND $3
    ORDER BY cf.fecha_emisi_cpcfa, numero_cpcfa`);
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addDateParam(2, dtoIn.fechaInicio);
        query.addDateParam(3, dtoIn.fechaFin);
        return await this.dataSource.createQueryPG(query);
    }



    /**
     * Retorna saldo inicial de un producto a una determinada fecha de corte
     * @param ide_inarti 
     * @param fechaCorte 
     * @returns 
     */
    async getSaldoInicial(ide_inarti: number, fechaCorte: Date): Promise<number> {
        let saldoInicial = 0;
        const querySaldoInicial = new SelectQuery(`     
        SELECT sum(cantidad_indci *signo_intci) as saldo
        from
            inv_det_comp_inve dci
            left join inv_cab_comp_inve cci on cci.ide_incci = dci.ide_incci
            left join inv_tip_tran_inve tti on tti.ide_intti = cci.ide_intti
            left join inv_tip_comp_inve tci on tci.ide_intci = tti.ide_intci
        where
            dci.ide_inarti = $1
            AND fecha_trans_incci <  $2
            AND ide_inepi =  ${this.variables.get('p_inv_estado_normal')} 
        GROUP BY   ide_inarti `);
        querySaldoInicial.addIntParam(1, ide_inarti);
        querySaldoInicial.addDateParam(2, fechaCorte);
        const data = await this.dataSource.createQuery(querySaldoInicial);
        if (data.length) {
            saldoInicial = Number(data[0].saldo);
        }
        return saldoInicial;
    }


}
