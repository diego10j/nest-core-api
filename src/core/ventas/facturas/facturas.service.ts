import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { BaseService } from '../../../common/base-service';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { FacturasDto } from './dto/facturas.dto';
import { CoreService } from 'src/core/core.service';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';
import { VentasDiariasDto } from './dto/ventas-diarias.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

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


    async getTableQueryPuntosEmisionFacturas(dto: PuntosEmisionFacturasDto & HeaderParamsDto) {
        const condSucu = dto.filterSucu === true ? `and ide_sucu =  ${dto.ideSucu}` : '';
        const condition = `ide_empr = ${dto.ideEmpr} 
                           AND ide_cntdoc = ${this.variables.get('p_con_tipo_documento_factura')} 
                           ${condSucu}`;
        const dtoIn = { ...dto, module: 'cxc', tableName: 'datos_fac', primaryKey: 'ide_ccdaf', orderBy: { column: 'establecimiento_ccdfa' }, condition }
        return this.core.getTableQuery(dtoIn);
    }


    async getPuntosEmisionFacturas(dtoIn: PuntosEmisionFacturasDto & HeaderParamsDto) {
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


    async getFacturas(dtoIn: FacturasDto & HeaderParamsDto) {
        const condPtoEmision = dtoIn.ide_ccdaf ? `and a.ide_ccdaf =  ${dtoIn.ide_ccdaf}` : '';
        const condEstadoFact = dtoIn.ide_ccefa ? `and a.ide_ccefa =  ${dtoIn.ide_ccefa}` : `and a.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} `;
        const condEstadoComp = dtoIn.ide_sresc ? `and a.ide_sresc =  ${dtoIn.ide_sresc}` : '';

        const query = new SelectQuery(`     
        select
            a.ide_cccfa,
            a.ide_ccdaf,
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
            claveacceso_srcom,
            nombre_vgven,
            nombre_cndfp,
            (
                select
                    numero_cncre
                from
                    con_cabece_retenc
                where
                    ide_cncre = a.ide_cncre
            ) as secuencial_rete,
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
        `, dtoIn);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    async getTotalFacturasPorEstado(dtoIn: FacturasDto & HeaderParamsDto) {
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
            AND a.fechaemision_srcom BETWEEN $1 AND $2
            AND a.ide_sucu = ${dtoIn.ideSucu}
        GROUP BY 
            b.nombre_sresc, 
            b.ide_sresc,
            b.icono_sresc,
            b.color_sresc
      `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createSelectQuery(query);
    }


    // =================================== ANALISIS DE DATOS

    /**
    * Retorna el total de ventas mensuales en un período
    * @param dtoIn 
    * @returns 
    */
    async getTotalVentasPeriodo(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        WITH FacturasFiltradas AS (
            SELECT 
                EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
                EXTRACT(YEAR FROM fecha_emisi_cccfa) AS anio,
                COUNT(ide_cccfa) AS num_facturas,
                SUM(base_grabada_cccfa) AS ventas12,
                SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas0,
                SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas_netas,
                SUM(valor_iva_cccfa) AS iva,
                SUM(total_cccfa) AS total
            FROM 
                cxc_cabece_factura
            WHERE 
                fecha_emisi_cccfa >= $1 AND fecha_emisi_cccfa <= $2
                AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(MONTH FROM fecha_emisi_cccfa),
                EXTRACT(YEAR FROM fecha_emisi_cccfa)
        )
        SELECT 
            gm.ide_gemes,
            gm.nombre_gemes,
            COALESCE(ff.num_facturas, 0) AS num_facturas,
            COALESCE(ff.ventas12, 0) AS ventas12,
            COALESCE(ff.ventas0, 0) AS ventas0,
            COALESCE(ff.ventas_netas, 0) AS ventas_netas,
            COALESCE(ff.iva, 0) AS iva,
            COALESCE(ff.total, 0) AS total,
            COALESCE(Utilidad_Mes(gm.ide_gemes::INTEGER, ${dtoIn.periodo}::INTEGER), 0) AS utilidad
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
    * 1. Variación diaria de ventas (últimos 30 días)
    * @param dtoIn 
    * @returns 
    */
    async getVariacionDiariaVentas(dtoIn: VentasDiariasDto & HeaderParamsDto) {
        const fecha = dtoIn.fecha ? `'${dtoIn.fecha}'::date` : 'CURRENT_DATE';

        const query = new SelectQuery(`
        SELECT 
            fecha_emisi_cccfa AS fecha,
            SUM(total_cccfa) AS venta_diaria,
            LAG(SUM(total_cccfa), 1) OVER (ORDER BY fecha_emisi_cccfa) AS venta_anterior,
            ROUND((SUM(total_cccfa) - LAG(SUM(total_cccfa), 1) OVER (ORDER BY fecha_emisi_cccfa)) / 
            NULLIF(LAG(SUM(total_cccfa), 1) OVER (ORDER BY fecha_emisi_cccfa), 0) * 100, 2) AS variacion_porcentual
        FROM 
            cxc_cabece_factura
        WHERE 
            fecha_emisi_cccfa BETWEEN ${fecha} - INTERVAL '30 days' AND ${fecha}
            AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            fecha_emisi_cccfa
        ORDER BY 
            fecha_emisi_cccfa             
            `);
        return await this.dataSource.createSelectQuery(query);
    }




    /**
    * 2. Tendencias de ventas por día de la semana
    * @param dtoIn 
    * @returns 
    */
    async getTendenciaVentasDia(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT 
            EXTRACT(DOW FROM fecha_emisi_cccfa) AS num_dia,
            TO_CHAR(fecha_emisi_cccfa, 'Day') AS dia_semana,
            COUNT(ide_cccfa) AS num_facturas,
            SUM(total_cccfa) AS total_ventas,
            AVG(total_cccfa) AS promedio_venta
        FROM 
            cxc_cabece_factura
        WHERE 
            fecha_emisi_cccfa BETWEEN $1 AND $2
            AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            TO_CHAR(fecha_emisi_cccfa, 'Day'), EXTRACT(DOW FROM fecha_emisi_cccfa)
        ORDER BY 
            num_dia     
            `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return await this.dataSource.createSelectQuery(query);
    }


    /**
    * 3. Mejores vendedores (top 10)
    * @param dtoIn 
    * @returns 
    */
    async getTopVendedores(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT 
                v.nombre_vgven AS vendedor,
                COUNT(cf.ide_cccfa) AS num_facturas,
                SUM(cf.total_cccfa) AS total_ventas,
                ROUND(SUM(cf.total_cccfa) / COUNT(cf.ide_cccfa), 2) AS promedio_venta,
                RANK() OVER (ORDER BY SUM(cf.total_cccfa) DESC) AS ranking
            FROM 
                cxc_cabece_factura cf
            JOIN 
                ven_vendedor v ON cf.ide_vgven = v.ide_vgven
            WHERE 
                fecha_emisi_cccfa BETWEEN $1 AND $2
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                v.nombre_vgven
            ORDER BY 
                total_ventas DESC
            LIMIT 10        
                `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return await this.dataSource.createSelectQuery(query);
    }


    /**
* 4. Distribución de ventas por forma de pago (gráfico de pastel)
* @param dtoIn 
* @returns 
*/
    async getTotalVentasPorFormaPago(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
                SELECT 
                fp.ide_cndfp,
                fp.nombre_cndfp AS forma_pago,
                COUNT(cf.ide_cccfa) AS num_facturas,
                SUM(cf.total_cccfa) AS total_ventas,
                ROUND(SUM(cf.total_cccfa) * 100.0 / (SELECT SUM(total_cccfa) 
                                                   FROM cxc_cabece_factura 
                                                   WHERE fecha_emisi_cccfa BETWEEN $1 AND $2
                                                   AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                                                   AND ide_empr = ${dtoIn.ideEmpr}), 2) AS porcentaje
            FROM 
                cxc_cabece_factura cf
            JOIN 
                con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
            WHERE 
                fecha_emisi_cccfa BETWEEN $3 AND $4
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                fp.ide_cndfp,
                fp.nombre_cndfp
            ORDER BY 
                total_ventas DESC
                    `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        return await this.dataSource.createSelectQuery(query);
    }




    /**
* 5. Productos más vendidos (top 10)
* @param dtoIn 
* @returns 
*/
    async getTopProductos(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
    SELECT 
        iart.ide_inarti,
        iart.nombre_inarti AS producto,
        SUM(cdf.cantidad_ccdfa) AS cantidad_vendida,
        f.siglas_inuni,
        SUM(cdf.total_ccdfa) AS total_ventas,
        ROUND(SUM(cdf.total_ccdfa) * 100.0 / (SELECT SUM(total_ccdfa) 
                                            FROM cxc_deta_factura cdf2
                                            JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                                            WHERE cf2.fecha_emisi_cccfa BETWEEN $1 AND $2
                                            AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                                            AND cf2.ide_empr = ${dtoIn.ideEmpr}), 2) AS porcentaje
    FROM 
        cxc_deta_factura cdf
    JOIN 
        inv_articulo iart ON cdf.ide_inarti = iart.ide_inarti
    JOIN 
        cxc_cabece_factura cf ON cdf.ide_cccfa = cf.ide_cccfa
    LEFT JOIN inv_unidad f ON iart.ide_inuni = f.ide_inuni
    WHERE 
        cf.fecha_emisi_cccfa BETWEEN $3 AND $4
        AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
        AND cf.ide_empr = ${dtoIn.ideEmpr}
    GROUP BY 
        iart.ide_inarti,
        iart.nombre_inarti,
        f.siglas_inuni
    ORDER BY 
        total_ventas DESC
    LIMIT 10
                `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        return await this.dataSource.createSelectQuery(query);
    }



    /**
  * 6. Ventas por hora del día
  * @param dtoIn 
  * @returns 
  */
    async getTotalVentasPorHora(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`   
    SELECT 
        EXTRACT(HOUR FROM c.hora_ingre) AS hora,
        COUNT(ide_cccfa) AS num_facturas,
        SUM(total_cccfa) AS total_ventas
    FROM 
        cxc_cabece_factura c
    WHERE 
        fecha_emisi_cccfa BETWEEN $1 AND $2
        AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
        AND ide_empr = ${dtoIn.ideEmpr}
    GROUP BY 
        EXTRACT(HOUR FROM c.hora_ingre)
    ORDER BY 
        hora  `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);

        return await this.dataSource.createSelectQuery(query);
    }



    /**
  * 7. Clientes más frecuentes (top 10)
  * @param dtoIn 
  * @returns 
  */
    async getTopClientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`  
        SELECT 
            p.ide_geper,
            p.nom_geper AS cliente,
            COUNT(cf.ide_cccfa) AS num_facturas,
            SUM(cf.total_cccfa) AS total_ventas,
            ROUND(SUM(cf.total_cccfa) / COUNT(cf.ide_cccfa), 2) AS ticket_promedio
        FROM 
            cxc_cabece_factura cf
        JOIN 
            gen_persona p ON cf.ide_geper = p.ide_geper
        WHERE 
            cf.fecha_emisi_cccfa BETWEEN $1 AND $2
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
            AND cf.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            p.ide_geper,
            p.nom_geper
        ORDER BY 
            total_ventas DESC
        LIMIT 10 `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }

    /**
  * 8. ventas promedio por vendedor
  * @param dtoIn 
  * @returns 
  */
    async getPromedioVentasPorVendedor(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`    
    SELECT 
	v.ide_vgven,
    v.nombre_vgven AS vendedor,
    COUNT(cf.ide_cccfa) AS num_facturas,
    SUM(cf.total_cccfa) AS total_ventas,
    ROUND(SUM(cf.total_cccfa) / COUNT(cf.ide_cccfa), 2) AS ticket_promedio,
    PERCENT_RANK() OVER (ORDER BY ROUND(SUM(cf.total_cccfa) / COUNT(cf.ide_cccfa), 2) DESC) AS percentil
FROM 
    cxc_cabece_factura cf
JOIN 
    ven_vendedor v ON cf.ide_vgven = v.ide_vgven
WHERE 
    fecha_emisi_cccfa  BETWEEN $1 AND $2
    AND cf.ide_ccefa  = ${this.variables.get('p_cxc_estado_factura_normal')}
    AND cf.ide_empr = ${dtoIn.ideEmpr}
GROUP BY 
	v.ide_vgven,
    v.nombre_vgven
ORDER BY 
    ticket_promedio DESC`);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }


    /**
  * 9.  Ventas por categoría de producto
  * @param dtoIn 
  * @returns 
  */
    async getVentasPorCategoriaProducto(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`    
    SELECT 
    COALESCE( art.ide_incate, -1) AS categoria,
    COALESCE(cat.nombre_incate, 'SIN CATEGORÍA') AS categoria,
    SUM(cdf.cantidad_ccdfa) AS cantidad_vendida,
    SUM(cdf.total_ccdfa) AS total_ventas
FROM 
    cxc_deta_factura cdf
JOIN 
    inv_articulo art ON cdf.ide_inarti = art.ide_inarti
LEFT JOIN 
    inv_categoria cat ON art.ide_incate = cat.ide_incate
JOIN 
    cxc_cabece_factura cf ON cdf.ide_cccfa = cf.ide_cccfa
WHERE 
    cf.fecha_emisi_cccfa  BETWEEN $1 AND $2
    AND cf.ide_ccefa   = ${this.variables.get('p_cxc_estado_factura_normal')}
    AND cf.ide_empr  = ${dtoIn.ideEmpr}
GROUP BY 
    art.ide_incate,
    COALESCE(cat.nombre_incate, 'SIN CATEGORÍA')
ORDER BY 
    total_ventas DESC`);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);

        return await this.dataSource.createSelectQuery(query);
    }



    /**
  * 10.  Tasa de crecimiento mensual
  * @param dtoIn 
  * @returns 
  */
    async getTasaCrecimientoMensual(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`    
   
   
WITH ventas_mensuales AS (
    SELECT 
        TO_CHAR(fecha_emisi_cccfa, 'YYYY-MM') AS mes,
        SUM(total_cccfa) AS ventas
    FROM 
        cxc_cabece_factura
    WHERE 
        fecha_emisi_cccfa BETWEEN $1 AND $2
        AND ide_ccefa  = ${this.variables.get('p_cxc_estado_factura_normal')}
        AND ide_empr = ${dtoIn.ideEmpr}
    GROUP BY 
        TO_CHAR(fecha_emisi_cccfa, 'YYYY-MM')
)
SELECT 
    mes,
    ventas,
    LAG(ventas, 1) OVER (ORDER BY mes) AS ventas_mes_anterior,
    ROUND((ventas - LAG(ventas, 1) OVER (ORDER BY mes)) / 
    NULLIF(LAG(ventas, 1) OVER (ORDER BY mes), 0) * 100, 2) AS crecimiento_porcentual
FROM 
    ventas_mensuales
ORDER BY 
    mes
`);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);

        return await this.dataSource.createSelectQuery(query);
    }




    /**
  * 11.  Facturas con mayor valor
  * @param dtoIn 
  * @returns 
  */
    async getFacturasMayorValor(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`      
      
        SELECT 
        cf._cccfa,
        cf.secuencial_cccfa,
        p.nom_geper AS cliente,
        cf.fecha_emisi_cccfa,
        cf.total_cccfa,
        v.nombre_vgven AS vendedor,
        fp.nombre_cndfp AS forma_pago
    FROM 
        cxc_cabece_factura cf
    JOIN 
        gen_persona p ON cf.ide_geper = p.ide_geper
    LEFT JOIN 
        ven_vendedor v ON cf.ide_vgven = v.ide_vgven
    LEFT JOIN 
        con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
    WHERE 
        cf.fecha_emisi_cccfa BETWEEN $1 AND $2
        AND cf.ide_ccefa  = ${this.variables.get('p_cxc_estado_factura_normal')}
        AND cf.ide_empr  = ${dtoIn.ideEmpr}
    ORDER BY 
        cf.total_cccfa DESC
    LIMIT 20;
`);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }


    /**
* 12.  Resumen Ventas por años
* @param dtoIn 
* @returns 
*/
    async getResumenVentasPeriodos(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`            
        SELECT 
        EXTRACT(YEAR FROM fecha_emisi_cccfa) AS anio,
        COUNT(ide_cccfa) AS total_facturas,
        SUM(total_cccfa) AS total_ventas,
        SUM(base_grabada_cccfa) AS base_imponible,
        SUM(valor_iva_cccfa) AS total_iva,
        SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas_exentas,
        ROUND(SUM(total_cccfa) / NULLIF(COUNT(ide_cccfa), 0), 2) AS ticket_promedio,
        COUNT(DISTINCT ide_geper) AS clientes_unicos,
        COUNT(DISTINCT ide_vgven) AS vendedores_activos
    FROM 
        cxc_cabece_factura
    WHERE 
        ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
        AND ide_empr  = ${dtoIn.ideEmpr}
    GROUP BY 
        EXTRACT(YEAR FROM fecha_emisi_cccfa)
    ORDER BY 
        anio DESC;
`);
        return await this.dataSource.createQuery(query);
    }

}