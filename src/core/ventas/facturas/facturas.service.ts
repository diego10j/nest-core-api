import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { BaseService } from '../../../common/base-service';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasDto } from './dto/facturas.dto';

@Injectable()
export class FacturasService extends BaseService {


    constructor(private readonly dataSource: DataSourceService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_cxc_estado_factura_normal', // 0
            'p_con_tipo_documento_factura', // 3
        ]).then(result => {
            this.variables = result;
        });
    }

    async getPuntosEmisionFacturas(dtoIn: PuntosEmisionFacturasDto) {
        const condSucu = dtoIn.filterSucu === true ? `and a.ide_sucu =  ${dtoIn.ideSucu}` : '';
        const query = new SelectQuery(`     
        select
            ide_ccdaf,
            --serie_ccdaf,
            establecimiento_ccdfa,
            pto_emision_ccdfa,
            observacion_ccdaf,
            num_inicia_ccdaf,
            num_actual_ccdfa,
            nom_sucu
        from
            cxc_datos_fac a
        inner join sis_sucursal b on a.ide_sucu = b.ide_sucu
        where
            ide_cntdoc = ${this.variables.get('p_con_tipo_documento_factura')} 
            ${condSucu}
            and a.ide_empr =  ${dtoIn.ideEmpr}
        `);
        return await this.dataSource.createQuery(query);
    }


    async getFacturas(dtoIn: FacturasDto) {
        const condPtoEmision = dtoIn.ide_ccdaf ? `and a.ide_ccdaf =  ${dtoIn.ide_ccdaf}` : '';
        const condEstadoFact = dtoIn.ide_ccefa ? `and a.ide_ccefa = =  ${dtoIn.ide_ccefa}` : `and a.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} `;
        const condEstadoComp = dtoIn.ide_sresc ? `and a.ide_sresc =  ${dtoIn.ide_sresc}` : '';

        const query = new SelectQuery(`     
        select
            a.ide_cccfa,
            fecha_emisi_cccfa,
            establecimiento_ccdfa,
            pto_emision_ccdfa,
            secuencial_cccfa,
            nombre_sresc as nombre_ccefa,
            nom_geper,
            identificac_geper,
            base_grabada_cccfa,
            base_tarifa0_cccfa + base_no_objeto_iva_cccfa as base0,
            valor_iva_cccfa,
            total_cccfa,
            claveacceso_srcom as CLAVE_ACCESO,
            nombre_vgven as VENDEDOR,
            nombre_cndfp as DIAS_CREDITO,
            (
                select
                    numero_cncre
                from
                    con_cabece_retenc
                where
                    ide_cncre = a.ide_cncre
            ) as NUM_RETENCION,
            fecha_trans_cccfa,
            ide_cncre,
            d.ide_srcom,
            a.ide_geper,
            ide_cnccc,
            a.usuario_ingre
        from
            cxc_cabece_factura a
            inner join gen_persona b on a.ide_geper = b.ide_geper
            inner join cxc_datos_fac c on a.ide_ccdaf = c.ide_ccdaf
            left join sri_comprobante d on a.ide_srcom = d.ide_srcom
            left join sri_estado_comprobante f on d.ide_sresc = f.ide_sresc
            left join ven_vendedor v on a.ide_vgven = v.ide_vgven
            left join con_deta_forma_pago x on a.ide_cndfp1 = x.ide_cndfp
        where
            fecha_emisi_cccfa BETWEEN $1 AND $2
            AND a.ide_empr = ${dtoIn.ideEmpr}
            ${condPtoEmision}
            ${condEstadoFact}
            ${condEstadoComp}
            
        ORDER BY
            secuencial_cccfa desc,
            ide_cccfa desc
        `);
        query.addDateParam(1, dtoIn.fechaInicio);
        query.addDateParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


}