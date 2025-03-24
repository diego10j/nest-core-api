import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { BaseService } from '../../../common/base-service';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasDto } from './dto/facturas.dto';
import { CoreService } from 'src/core/core.service';
import { ServiceDto } from 'src/common/dto/service.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { VentasDiariasDto } from './dto/ventas-diarias.dto';

@Injectable()
export class FacturasService extends BaseService {


    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService
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


    async getTableQueryPuntosEmisionFacturas(dto: PuntosEmisionFacturasDto) {
        const condSucu = dto.filterSucu === true ? `and ide_sucu =  ${dto.ideSucu}` : '';
        const condition = `ide_empr = ${dto.ideEmpr} 
                           AND ide_cntdoc = ${this.variables.get('p_con_tipo_documento_factura')} 
                           ${condSucu}`;
        const dtoIn = { ...dto, module: 'cxc', tableName: 'datos_fac', primaryKey: 'ide_ccdaf', orderBy: { column: 'establecimiento_ccdfa' }, condition }
        return this.core.getTableQuery(dtoIn);
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
        const condEstadoFact = dtoIn.ide_ccefa ? `and a.ide_ccefa =  ${dtoIn.ide_ccefa}` : `and a.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} `;
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

    async getTotalFacturasPorEstado(dtoIn: FacturasDto) {
        const query = new SelectQuery(`  
        SELECT 
            COUNT(a.ide_srcom) AS contador, 
            b.nombre_sresc, 
            b.ide_sresc,
            b.icono_sresc,
            b.color_sresc
        FROM 
            sri_estado_comprobante b
        LEFT JOIN 
            sri_comprobante a 
        ON 
            a.ide_sresc = b.ide_sresc
            AND a.coddoc_srcom = '01'
            AND a.fechaemision_srcom BETWEEN '2010-01-01' AND '2022-01-01'
            AND a.ide_sucu = 2
        GROUP BY 
            b.nombre_sresc, 
            b.ide_sresc,
            b.icono_sresc,
            b.color_sresc
      `);
        return await this.dataSource.createSelectQuery(query);
    }



    /**
    * Retorna el total de ventas mensuales en un período
    * @param dtoIn 
    * @returns 
    */
    async getTotalVentasPeriodo(dtoIn: VentasMensualesDto) {
        const query = new SelectQuery(`
            WITH FacturasFiltradas AS (
                SELECT 
                    EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
                    COUNT(ide_cccfa) AS num_facturas,
                    SUM(base_grabada_cccfa) AS ventas12,
                    SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas0,
                    SUM(valor_iva_cccfa) AS iva,
                    SUM(total_cccfa) AS total
                FROM 
                    cxc_cabece_factura
                WHERE 
                    fecha_emisi_cccfa >= $1 AND fecha_emisi_cccfa <= $2
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    EXTRACT(MONTH FROM fecha_emisi_cccfa)
            )
            SELECT 
                gm.nombre_gemes,
                COALESCE(ff.num_facturas, 0) AS num_facturas,
                COALESCE(ff.ventas12, 0) AS ventas12,
                COALESCE(ff.ventas0, 0) AS ventas0,
                COALESCE(ff.iva, 0) AS iva,
                COALESCE(ff.total, 0) AS total
            FROM 
                gen_mes gm
            LEFT JOIN 
                FacturasFiltradas ff ON gm.ide_gemes = ff.mes
            ORDER BY 
                gm.ide_gemes
            `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        return await this.dataSource.createQuery(query);
    }



    /**
    * Retorna el total de ventas de los últimos 7 dias a excepcion del dia domingo
    * @param dtoIn 
    * @returns 
    */
    async getTotalUltimasVentasDiarias(dtoIn: VentasDiariasDto) {
        const query = new SelectQuery(`
        WITH DiasFiltrados AS (
            -- Generar los últimos 9 días excluyendo domingos
            SELECT fecha::DATE
            FROM generate_series(
                '${dtoIn.fecha}'::DATE - INTERVAL '9 days',
                '${dtoIn.fecha}'::DATE,
                INTERVAL '1 day'
            ) fecha
            WHERE EXTRACT(DOW FROM fecha) != 0 -- Excluir domingos
            ORDER BY fecha DESC
            LIMIT 7
        ),
        FacturasFiltradas AS (
            SELECT 
                fecha_emisi_cccfa AS fecha,
                TO_CHAR(fecha_emisi_cccfa, 'FMDay') AS nombre_dia,
                LEFT(TO_CHAR(fecha_emisi_cccfa, 'FMDay'), 1) AS inicial_dia,
                EXTRACT(DAY FROM fecha_emisi_cccfa) AS numero_dia,
                (EXTRACT(DOW FROM fecha_emisi_cccfa) + 6) % 7 + 1 AS numero_dia_semana,
                COUNT(ide_cccfa) AS num_facturas,
                SUM(base_grabada_cccfa) AS ventas12,
                SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas0,
                SUM(valor_iva_cccfa) AS iva,
                SUM(total_cccfa) AS total
            FROM cxc_cabece_factura
            WHERE 
                fecha_emisi_cccfa >= (SELECT MIN(fecha) FROM DiasFiltrados)
                AND fecha_emisi_cccfa <= $1 
                AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND ide_empr = ${dtoIn.ideEmpr}
            GROUP BY fecha_emisi_cccfa
        )
        SELECT 
            numero_dia,
            d.fecha,
            nombre_dia,
            inicial_dia,
            numero_dia_semana,
            COALESCE(f.num_facturas, 0) AS num_facturas,
            COALESCE(f.ventas12, 0) AS ventas12,
            COALESCE(f.ventas0, 0) AS ventas0,
            COALESCE(f.iva, 0) AS iva,
            COALESCE(f.total, 0) AS total,
            CASE 
                WHEN LAG(f.total) OVER (ORDER BY d.fecha) IS NOT NULL THEN 
                    ROUND(((f.total - LAG(f.total) OVER (ORDER BY d.fecha)) / LAG(f.total) OVER (ORDER BY d.fecha)) * 100, 2)
                ELSE NULL 
            END AS variacion_porcentual
        FROM DiasFiltrados d
        LEFT JOIN FacturasFiltradas f ON d.fecha = f.fecha
        ORDER BY d.fecha;       
        
            `);
        query.addDateParam(1, dtoIn.fecha);

        return await this.dataSource.createQuery(query);
    }



}