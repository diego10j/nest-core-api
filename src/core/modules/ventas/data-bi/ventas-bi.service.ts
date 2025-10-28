import { Injectable } from '@nestjs/common';
import { getYear } from 'date-fns';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { ClientesProductoDto } from '../../inventario/data-bi/dto/clientes-producto.dto';
import { TopProductosDto } from '../../inventario/data-bi/dto/top-productos';
import { IdProductoDto } from '../../inventario/productos/dto/id-producto.dto';

import { VariacionVentasPeriodoDto } from '../facturas/dto/variacion-periodos.dto';
import { VentasDiariasDto } from '../facturas/dto/ventas-diarias.dto';
import { VentasMensualesDto } from '../facturas/dto/ventas-mensuales.dto';

@Injectable()
export class VentasBiService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.core
            .getVariables([
                'p_cxc_estado_factura_normal', // 0
                'p_con_tipo_documento_factura', // 3
                'p_inv_estado_normal', // 1
                'p_cxp_estado_factura_normal', //0
            ])
            .then((result) => {
                this.variables = result;
            });
    }



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
            SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas_brutas,
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
    ),
    NotasCredito AS (
        SELECT 
            EXTRACT(MONTH FROM fecha_emisi_cpcno) AS mes,
            EXTRACT(YEAR FROM fecha_emisi_cpcno) AS anio,
            SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_nota_credito
        FROM 
            cxp_cabecera_nota cn 
        WHERE 
            fecha_emisi_cpcno BETWEEN $3 AND $4
            AND cn.ide_cpeno = 1
            AND cn.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            EXTRACT(MONTH FROM fecha_emisi_cpcno),
            EXTRACT(YEAR FROM fecha_emisi_cpcno)
    )
    SELECT 
        gm.ide_gemes,
        gm.nombre_gemes,
        COALESCE(ff.num_facturas, 0) AS num_facturas,
        COALESCE(ff.ventas12, 0) AS ventas_con_iva,
        COALESCE(ff.ventas0, 0) AS ventas0,
        COALESCE(nc.total_nota_credito, 0) AS total_nota_credito,
        COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) AS ventas_netas,
        COALESCE(ff.iva, 0) AS iva,
        COALESCE(ff.total, 0) - COALESCE(nc.total_nota_credito, 0) AS total,
        COALESCE(f_total_utilidad_mes(${dtoIn.ideEmpr},gm.ide_gemes::INTEGER, ${dtoIn.periodo}::INTEGER), 0) AS utilidad
    FROM 
        gen_mes gm
    LEFT JOIN 
        FacturasFiltradas ff ON gm.ide_gemes = ff.mes
    LEFT JOIN 
        NotasCredito nc ON gm.ide_gemes = nc.mes AND (ff.anio = nc.anio OR ff.anio IS NULL)
    ORDER BY 
        gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addStringParam(3, `${dtoIn.periodo}-01-01`);
        query.addStringParam(4, `${dtoIn.periodo}-12-31`);
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
    WITH fechas_laborables AS (
        SELECT 
            fecha::date
        FROM 
            generate_series(${fecha}::date - INTERVAL '30 days', ${fecha}::date, INTERVAL '1 day') AS fecha
        WHERE 
            EXTRACT(DOW FROM fecha) <> 0 -- Excluir domingos (0=domingo, 1=lunes, etc.)
        ORDER BY 
            fecha DESC
    ),
    ventas_con_facturas AS (
        SELECT 
            fecha_emisi_cccfa AS fecha,
            SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS venta_bruta,
            COUNT(ide_cccfa) AS num_facturas
        FROM 
            cxc_cabece_factura
        WHERE 
            fecha_emisi_cccfa BETWEEN (${fecha}::date - INTERVAL '30 days') AND ${fecha}::date
            AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            fecha_emisi_cccfa
        HAVING 
            COUNT(ide_cccfa) > 0 -- Solo días con facturas
    ),
    notas_credito AS (
        SELECT 
            fecha_emisi_cpcno AS fecha,
            SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_nota_credito
        FROM 
            cxp_cabecera_nota
        WHERE 
            fecha_emisi_cpcno BETWEEN (${fecha}::date - INTERVAL '30 days') AND ${fecha}::date
            AND ide_cpeno = 1
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            fecha_emisi_cpcno
    )
    SELECT 
        vcf.fecha,
        vcf.venta_bruta - COALESCE(nc.total_nota_credito, 0) AS venta_diaria,
        vcf.num_facturas,
        COALESCE(nc.total_nota_credito, 0) AS total_nota_credito,
        LAG(vcf.venta_bruta - COALESCE(nc.total_nota_credito, 0), 1, 0) OVER (ORDER BY vcf.fecha) AS venta_anterior,
        ROUND(
            ((vcf.venta_bruta - COALESCE(nc.total_nota_credito, 0)) - 
            LAG(vcf.venta_bruta - COALESCE(nc.total_nota_credito, 0), 1, 0) OVER (ORDER BY vcf.fecha)) / 
            NULLIF(LAG(vcf.venta_bruta - COALESCE(nc.total_nota_credito, 0), 1, 0) OVER (ORDER BY vcf.fecha), 0) * 100, 
            2
        ) AS variacion_porcentual
    FROM 
        ventas_con_facturas vcf
    LEFT JOIN 
        notas_credito nc ON vcf.fecha = nc.fecha
    WHERE 
        vcf.fecha IN (SELECT fecha FROM fechas_laborables)
    ORDER BY 
        vcf.fecha DESC
    LIMIT 15
        `);
        return await this.dataSource.createQuery(query);
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
        SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas,
        AVG(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS promedio_venta
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
        return await this.dataSource.createQuery(query);
    }

    /**
     * 3. Mejores vendedores (top 10)
     * @param dtoIn
     * @returns
     */
    async getTopVendedores(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
    WITH ventas_vendedor AS (
        SELECT 
            v.ide_vgven,
            v.nombre_vgven,
            COUNT(cf.ide_cccfa) AS num_facturas,
            SUM(cf.base_grabada_cccfa + cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa) AS ventas_brutas,
            SUM(cf.total_cccfa) AS total_bruto
        FROM 
            cxc_cabece_factura cf
        JOIN 
            ven_vendedor v ON cf.ide_vgven = v.ide_vgven
        WHERE 
            cf.fecha_emisi_cccfa BETWEEN $1 AND $2
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            v.ide_vgven, v.nombre_vgven
    ),
    notas_credito_vendedor AS (
        SELECT 
            cf.ide_vgven,
            SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno) AS total_notas_credito
        FROM 
            cxp_cabecera_nota cn
        JOIN 
            cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
        WHERE 
            cn.fecha_emisi_cpcno BETWEEN $3 AND $4
            AND cn.ide_cpeno = 1
            AND cn.ide_empr = ${dtoIn.ideEmpr}
            AND cf.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            cf.ide_vgven
    )
    SELECT 
        vv.nombre_vgven AS vendedor,
        vv.num_facturas,
        vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0) AS total_ventas,
        COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
        ROUND((vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) / vv.num_facturas, 2) AS promedio_venta,
        ROUND((vv.total_bruto - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
            (SELECT SUM(total_cccfa) FROM cxc_cabece_factura 
             WHERE fecha_emisi_cccfa BETWEEN $5 AND $6 
             AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
             AND ide_empr = ${dtoIn.ideEmpr}), 2) AS porcentaje
    FROM 
        ventas_vendedor vv
    LEFT JOIN 
        notas_credito_vendedor nc ON vv.ide_vgven = nc.ide_vgven
    ORDER BY 
        total_ventas DESC
    LIMIT 10      
            `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addStringParam(5, dtoIn.fechaInicio);
        query.addStringParam(6, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
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
            SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas,
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
        return await this.dataSource.createQuery(query);
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

        return await this.dataSource.createQuery(query);
    }

    /**
     * 7. Clientes más frecuentes (top 10)
     * @param dtoIn
     * @returns
     */
    async getTopClientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `  
    SELECT 
    p.ide_geper,
    p.uuid,
    p.nom_geper AS cliente,
    COUNT(cf.ide_cccfa) AS num_facturas,
    SUM(cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa + cf.base_grabada_cccfa) AS total_ventas_brutas,
    COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
    SUM(cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa + cf.base_grabada_cccfa) - COALESCE(nc.total_notas_credito, 0) AS total_ventas_netas,
    ROUND(SUM(cf.total_cccfa) * 100.0 / 
        (SELECT SUM(total_cccfa) 
         FROM cxc_cabece_factura 
         WHERE fecha_emisi_cccfa BETWEEN $1 AND $2 
         AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
         AND ide_empr = ${dtoIn.ideEmpr}), 2) AS porcentaje
FROM 
    cxc_cabece_factura cf
JOIN 
    gen_persona p ON cf.ide_geper = p.ide_geper
LEFT JOIN (
    SELECT 
        cf.ide_geper,
        SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno) AS total_notas_credito
    FROM 
        cxp_cabecera_nota cn
    JOIN 
        cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
    WHERE 
        cn.fecha_emisi_cpcno BETWEEN $3 AND $4
        AND cn.ide_cpeno = 1
        AND cn.ide_empr = ${dtoIn.ideEmpr}
    GROUP BY 
        cf.ide_geper
) nc ON p.ide_geper = nc.ide_geper
WHERE 
    cf.fecha_emisi_cccfa BETWEEN $5 AND $6
    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
    AND cf.ide_empr = ${dtoIn.ideEmpr}
GROUP BY 
    p.ide_geper,
    p.uuid,
    p.nom_geper,
    nc.total_notas_credito
ORDER BY 
    total_ventas_netas DESC
LIMIT 10 `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addStringParam(5, dtoIn.fechaInicio);
        query.addStringParam(6, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    /**
     * 8. ventas promedio por vendedor
     * @param dtoIn
     * @returns
     */
    async getPromedioVentasPorVendedor(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `    
    SELECT 
    v.ide_vgven,
    v.nombre_vgven AS vendedor,
    COUNT(cf.ide_cccfa) AS num_facturas,
    SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa + base_grabada_cccfa) AS total_ventas_bruto,
    COALESCE(SUM(
        (SELECT SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno)
         FROM cxp_cabecera_nota cn 
         WHERE cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
         AND cn.ide_cpeno = 1
         AND cn.ide_empr = ${dtoIn.ideEmpr})
    ), 0) AS total_notas_credito,
    SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa + base_grabada_cccfa) - 
    COALESCE(SUM(
        (SELECT SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno)
         FROM cxp_cabecera_nota cn 
         WHERE cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
         AND cn.ide_cpeno = 1
         AND cn.ide_empr = ${dtoIn.ideEmpr})
    ), 0) AS total_ventas_neto,
    ROUND(SUM(cf.total_cccfa) * 100.0 / 
        (SELECT SUM(total_cccfa) 
         FROM cxc_cabece_factura 
         WHERE fecha_emisi_cccfa BETWEEN $1 AND $2 
         AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
         AND ide_empr = ${dtoIn.ideEmpr}), 2) AS porcentaje,
    PERCENT_RANK() OVER (ORDER BY ROUND(SUM(cf.total_cccfa) / COUNT(cf.ide_cccfa), 2) DESC) AS percentil
FROM 
    cxc_cabece_factura cf
JOIN 
    ven_vendedor v ON cf.ide_vgven = v.ide_vgven
WHERE 
    fecha_emisi_cccfa BETWEEN $3 AND $4
    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
    AND cf.ide_empr = ${dtoIn.ideEmpr}
GROUP BY 
    v.ide_vgven,
    v.nombre_vgven
ORDER BY 
    nombre_vgven`,
            dtoIn,
        );

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);

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
        COUNT(cf.ide_cccfa) AS num_facturas,
        SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas
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

        return await this.dataSource.createQuery(query);
    }

    async getVentasPorIdCliente(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`
    SELECT
        c.ide_getid,
        nombre_getid,
        COUNT(1) AS num_facturas,
        SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas
    FROM
        cxc_cabece_factura a
        INNER JOIN cxc_deta_factura b ON a.ide_cccfa = b.ide_cccfa
        inner join gen_persona c on a.ide_geper = c.ide_geper
        inner join gen_tipo_identifi d on c.ide_getid = d.ide_getid
    WHERE
        a.fecha_emisi_cccfa >= $1
        AND a.fecha_emisi_cccfa <= $2
        AND a.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
        AND a.ide_empr = ${dtoIn.ideEmpr} 
    GROUP BY
        c.ide_getid,
        nombre_getid    
    ORDER BY
        total_ventas DESC   
    `);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
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
            TO_CHAR(cf.fecha_emisi_cccfa, 'YYYY-MM') AS mes,
            SUM(cf.total_cccfa) AS total_ventas_bruto,
            COALESCE(
                SUM(
                    (SELECT SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno)
                     FROM cxp_cabecera_nota cn 
                     WHERE cn.ide_cpeno = 1
                     AND cn.ide_empr = ${dtoIn.ideEmpr}
                     AND cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0'))
                ), 0
            ) AS total_notas_credito
        FROM 
            cxc_cabece_factura cf
        WHERE 
            cf.fecha_emisi_cccfa BETWEEN $1 AND $2
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
            AND cf.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            TO_CHAR(cf.fecha_emisi_cccfa, 'YYYY-MM')
    ),
    ventas_netas AS (
        SELECT
            mes,
            total_ventas_bruto,
            total_notas_credito,
            (total_ventas_bruto - total_notas_credito) AS ventas_netas
        FROM
            ventas_mensuales
    )
    SELECT 
        vn.mes,
        vn.total_ventas_bruto,
        vn.total_notas_credito,
        vn.ventas_netas AS total_ventas_netas,
        LAG(vn.ventas_netas, 1) OVER (ORDER BY vn.mes) AS ventas_mes_anterior,
        ROUND(
            (vn.ventas_netas - LAG(vn.ventas_netas, 1) OVER (ORDER BY vn.mes)) / 
            NULLIF(LAG(vn.ventas_netas, 1) OVER (ORDER BY vn.mes), 0) * 100, 
        2
        ) AS crecimiento_porcentual
    FROM 
        ventas_netas vn
    ORDER BY 
        vn.mes
`);
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    /**
     * 11.  Facturas con mayor valor
     * @param dtoIn
     * @returns
     */
    async getFacturasMayorValor(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`      
  
    SELECT 
    cf.ide_cccfa,
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
LIMIT 20
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
    WITH notas_credito_anio AS (
        SELECT 
            EXTRACT(YEAR FROM fecha_emisi_cpcno) AS anio,
            SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_notas
        FROM 
            cxp_cabecera_nota
        WHERE 
            ide_cpeno = 1
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            EXTRACT(YEAR FROM fecha_emisi_cpcno)
    )
    
    SELECT 
        EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
        COUNT(cf.ide_cccfa) AS total_facturas,
        SUM(cf.base_grabada_cccfa) AS base_grabada_cccfa,
        SUM(cf.valor_iva_cccfa) AS total_iva,
        SUM(cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa) AS ventas_exentas,
        SUM(cf.base_grabada_cccfa + cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa) AS total_ventas_bruto,
        COALESCE(nc.total_notas, 0) AS total_notas_credito,
        SUM(cf.base_grabada_cccfa + cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa) - 
        COALESCE(nc.total_notas, 0) AS total_ventas_neto,
        COUNT(DISTINCT cf.ide_geper) AS clientes_unicos,
        COUNT(DISTINCT cf.ide_vgven) AS vendedores_activos
    FROM 
        cxc_cabece_factura cf
    LEFT JOIN 
        notas_credito_anio nc ON EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) = nc.anio
    WHERE 
        cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
        AND cf.ide_empr = ${dtoIn.ideEmpr}
    GROUP BY 
        EXTRACT(YEAR FROM cf.fecha_emisi_cccfa),
        nc.total_notas
    ORDER BY 
        anio DESC
`);
        return await this.dataSource.createQuery(query);
    }

    /**
     * 12.  Resumen Ventas por años
     * @param dtoIn
     * @returns
     */
    async getVariacionVentasPeriodos(dtoIn: VariacionVentasPeriodoDto & HeaderParamsDto) {
        const query = new SelectQuery(`            


    WITH VentasPeriodo1 AS (
        SELECT 
            EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
            COUNT(ide_cccfa) AS facturas_p1,
            SUM(total_cccfa) AS ventas_p1,
            SUM(base_grabada_cccfa) AS basegrabada_p1,
            SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS base0_p1,
            SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas_p1,
            SUM(valor_iva_cccfa) AS iva_p1
        FROM 
            cxc_cabece_factura
        WHERE 
            EXTRACT(YEAR FROM fecha_emisi_cccfa) = $1
            AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            EXTRACT(MONTH FROM fecha_emisi_cccfa)
    ),
    VentasPeriodo2 AS (
        SELECT 
            EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
            COUNT(ide_cccfa) AS facturas_p2,
            SUM(total_cccfa) AS ventas_p2,
            SUM(base_grabada_cccfa) AS basegrabada_p2,
            SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS base0_p2,
            SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas_p2,
            SUM(valor_iva_cccfa) AS iva_p2
        FROM 
            cxc_cabece_factura
        WHERE 
            EXTRACT(YEAR FROM fecha_emisi_cccfa) = $2
            AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            EXTRACT(MONTH FROM fecha_emisi_cccfa)
    ),
    NotasCreditoPeriodo1 AS (
        SELECT 
            EXTRACT(MONTH FROM fecha_emisi_cpcno) AS mes,
            SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_notas_credito_p1
        FROM 
            cxp_cabecera_nota cn
        WHERE 
            EXTRACT(YEAR FROM fecha_emisi_cpcno) = $3
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            EXTRACT(MONTH FROM fecha_emisi_cpcno)
    ),
    NotasCreditoPeriodo2 AS (
        SELECT 
            EXTRACT(MONTH FROM fecha_emisi_cpcno) AS mes,
            SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_notas_credito_p2
        FROM 
            cxp_cabecera_nota cn
        WHERE 
            EXTRACT(YEAR FROM fecha_emisi_cpcno) = $4
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            EXTRACT(MONTH FROM fecha_emisi_cpcno)
    )
    SELECT 
        gm.nombre_gemes AS mes,
        -- Facturas
        COALESCE(v1.facturas_p1, 0) AS facturas_p1,
        COALESCE(v2.facturas_p2, 0) AS facturas_p2,
        CASE 
            WHEN COALESCE(v1.facturas_p1, 0) = 0 THEN NULL
            ELSE ROUND((COALESCE(v2.facturas_p2, 0) - COALESCE(v1.facturas_p1, 0)) * 100.0 / 
                 COALESCE(v1.facturas_p1, 1), 2)
        END AS variacion_facturas,
        
        -- Ventas totales (ya restando notas de crédito)
        COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0) AS ventas_p1,
        COALESCE(v2.ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0) AS ventas_p2,
        CASE 
            WHEN COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0) = 0 THEN NULL
            ELSE ROUND(((COALESCE(v2.ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0)) - 
                 (COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0))) * 100.0 / 
                 (COALESCE(v1.ventas_p1, 1) - COALESCE(nc1.total_notas_credito_p1, 0)), 2)
        END AS variacion_ventas,
        
        -- Base 12 (asumo que es basegrabada)
        COALESCE(v1.basegrabada_p1, 0) AS base12_p1,
        COALESCE(v2.basegrabada_p2, 0) AS base12_p2,
        CASE 
            WHEN COALESCE(v1.basegrabada_p1, 0) = 0 THEN NULL
            ELSE ROUND((COALESCE(v2.basegrabada_p2, 0) - COALESCE(v1.basegrabada_p1, 0)) * 100.0 / 
                 COALESCE(v1.basegrabada_p1, 1), 2)
        END AS variacion_base12,
        
        -- Base 0
        COALESCE(v1.base0_p1, 0) AS base0_p1,
        COALESCE(v2.base0_p2, 0) AS base0_p2,
        CASE 
            WHEN COALESCE(v1.base0_p1, 0) = 0 THEN NULL
            ELSE ROUND((COALESCE(v2.base0_p2, 0) - COALESCE(v1.base0_p1, 0)) * 100.0 / 
                 COALESCE(v1.base0_p1, 1), 2)
        END AS variacion_base0,
        
        -- IVA (deberías también restar el IVA de las notas de crédito si lo tienes)
        COALESCE(v1.iva_p1, 0) AS iva_p1,
        COALESCE(v2.iva_p2, 0) AS iva_p2,
        CASE 
            WHEN COALESCE(v1.iva_p1, 0) = 0 THEN NULL
            ELSE ROUND((COALESCE(v2.iva_p2, 0) - COALESCE(v1.iva_p1, 0)) * 100.0 / 
                 COALESCE(v1.iva_p1, 1), 2)
        END AS variacion_iva,
        
        -- Totales ventas netas (ventas - notas de crédito)
        COALESCE(v1.total_ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0) AS total_ventas_netas_p1,
        COALESCE(v2.total_ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0) AS total_ventas_netas_p2,
        CASE 
            WHEN COALESCE(v1.total_ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0) = 0 THEN NULL
            ELSE ROUND(((COALESCE(v2.total_ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0)) - 
                 (COALESCE(v1.total_ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0))) * 100.0 / 
                 (COALESCE(v1.total_ventas_p1, 1) - COALESCE(nc1.total_notas_credito_p1, 0)), 2)
        END AS variacion_total_ventas_netas
    FROM 
        gen_mes gm
    LEFT JOIN 
        VentasPeriodo1 v1 ON gm.ide_gemes = v1.mes
    LEFT JOIN 
        VentasPeriodo2 v2 ON gm.ide_gemes = v2.mes
    LEFT JOIN 
        NotasCreditoPeriodo1 nc1 ON gm.ide_gemes = nc1.mes
    LEFT JOIN 
        NotasCreditoPeriodo2 nc2 ON gm.ide_gemes = nc2.mes
    ORDER BY 
        gm.ide_gemes
`);
        query.addParam(1, dtoIn.periodoCompara);
        query.addParam(2, dtoIn.periodo);
        query.addParam(3, dtoIn.periodoCompara);
        query.addParam(4, dtoIn.periodo);
        return await this.dataSource.createQuery(query);
    }



    // ------------------------------------------


    /**
     * Retorna los N productos mas vendidos por la cantidad en un rango de fechas
     * @param dtoIn
     * @returns
     */
    async getTopProductosVendidos(dtoIn: TopProductosDto & HeaderParamsDto) {
        const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';
        const query = new SelectQuery(
            `
        WITH ventas_producto AS (
            SELECT 
                iart.ide_inarti,
                iart.nombre_inarti,
                uni.siglas_inuni,
                SUM(cdf.cantidad_ccdfa) AS total_cantidad_ventas
            FROM 
                cxc_deta_factura cdf
            JOIN 
                inv_articulo iart ON cdf.ide_inarti = iart.ide_inarti
            JOIN 
                cxc_cabece_factura cf ON cdf.ide_cccfa = cf.ide_cccfa
            LEFT JOIN 
                inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            WHERE 
                cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND hace_kardex_inarti = true
            GROUP BY 
                iart.ide_inarti, iart.nombre_inarti, uni.siglas_inuni
        ),
        notas_credito_producto AS (
            SELECT 
                cdn.ide_inarti,
                SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
            FROM 
                cxp_cabecera_nota cn
            JOIN 
                cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
            JOIN 
                cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
            WHERE 
                cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                AND cn.ide_cpeno = 1
                AND cn.ide_empr = ${dtoIn.ideEmpr}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                cdn.ide_inarti
        )
        SELECT 
            vp.ide_inarti,
            UPPER(vp.nombre_inarti) as nombre_inarti,
            (vp.total_cantidad_ventas - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad,
            vp.siglas_inuni,
            vp.total_cantidad_ventas AS cantidad_bruta,
            COALESCE(nc.total_cantidad_notas, 0) AS cantidad_notas_credito
        FROM 
            ventas_producto vp
        LEFT JOIN 
            notas_credito_producto nc ON vp.ide_inarti = nc.ide_inarti
        ORDER BY 
            total_cantidad DESC
         ${limitConfig}`,
            dtoIn,
        );

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna los productos mas facturados
     * @param dtoIn
     * @returns
     */
    async getTopProductosFacturados(dtoIn: TopProductosDto & HeaderParamsDto) {
        const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';
        const query = new SelectQuery(
            `
        SELECT
            iart.ide_inarti,
            upper(iart.nombre_inarti) as nombre_inarti,
            COUNT(1) AS num_facturas
        FROM
            cxc_deta_factura cdf
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
        WHERE
            cf.fecha_emisi_cccfa BETWEEN $1 AND $2
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
            AND hace_kardex_inarti = true
        GROUP BY
            iart.ide_inarti,
            iart.nombre_inarti
        ORDER BY
            num_facturas  DESC
        ${limitConfig}`,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }



    /**
     * Retorna el top N clientes de un producto  en un rango de fechas
     * @param dtoIn 
     * @returns 
     */
    async getTopClientesProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `  
            SELECT 
                p.ide_geper,
            p.uuid,
            p.nom_geper AS cliente,
            COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
            SUM(cdf.total_ccdfa) AS total_ventas_brutas,
            COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
            SUM(cdf.total_ccdfa) - COALESCE(nc.total_notas_credito, 0) AS total_ventas_netas,
            ROUND(
                (SUM(cdf.total_ccdfa) - COALESCE(nc.total_notas_credito, 0)) * 100.0 /
                NULLIF((
                    SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $1 AND $2
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $7
                ), 0),
            2) AS porcentaje
        FROM 
                cxc_cabece_factura cf
        JOIN 
                gen_persona p ON cf.ide_geper = p.ide_geper
        JOIN
                cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
            LEFT JOIN(
            SELECT 
                    cdn.ide_inarti,
            cf.ide_geper,
            SUM(cdn.valor_cpdno) AS total_notas_credito
                FROM 
                    cxp_cabecera_nota cn
                JOIN 
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa:: text, 9, '0')
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $8
                GROUP BY 
                    cdn.ide_inarti, cf.ide_geper
        ) nc ON p.ide_geper = nc.ide_geper AND cdf.ide_inarti = nc.ide_inarti
        WHERE
        cf.fecha_emisi_cccfa BETWEEN $5 AND $6
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND cdf.ide_inarti = $9
            GROUP BY
        p.ide_geper,
            p.uuid,
            p.nom_geper,
            nc.total_notas_credito
            ORDER BY 
                total_ventas_netas DESC
            LIMIT ${dtoIn.limit || 10} `,
            dtoIn,
        );

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addStringParam(5, dtoIn.fechaInicio);
        query.addStringParam(6, dtoIn.fechaFin);
        query.addIntParam(7, dtoIn.ide_inarti);
        query.addIntParam(8, dtoIn.ide_inarti);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    /**
  * Retorna top 10 mejores proveedores en un periodo
  * @param dtoIn
  * @returns
  */
    async getTopProveedoresProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {

        const query = new SelectQuery(
            `
        SELECT
            p.ide_geper,
            upper(p.nom_geper) as nom_geper,
            COUNT(1) AS num_facturas,
            SUM(cdf.cantidad_cpdfa) AS total_cantidad,
            SUM(cdf.cantidad_cpdfa * cdf.precio_cpdfa) AS total_valor,
            siglas_inuni
        FROM
            cxp_detall_factur cdf
            INNER JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = cdf.ide_cpcfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
        WHERE
            cdf.ide_inarti = $1
            AND cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
            AND cf.fecha_emisi_cpcfa BETWEEN $2 AND $3
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            p.ide_geper,
            p.nom_geper,
            siglas_inuni
        ORDER BY
            total_valor DESC
            LIMIT ${dtoIn.limit || 10} `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_inarti);
        query.addStringParam(2, dtoIn.fechaInicio);
        query.addStringParam(3, dtoIn.fechaFin);

        return await this.dataSource.createQuery(query);
    }

    async getTotalVentasProductoPorFormaPago(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_producto_forma_pago AS (
                SELECT 
                    fp.ide_cndfp,
                    fp.nombre_cndfp AS forma_pago,
                    COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                    SUM(cdf.total_ccdfa) AS total_ventas_brutas,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad
                FROM 
                    cxc_cabece_factura cf
                JOIN 
                    con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $5
                GROUP BY 
                    fp.ide_cndfp,
                    fp.nombre_cndfp
            ),
            notas_credito_producto_forma_pago AS (
                SELECT 
                    fp.ide_cndfp,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN 
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                JOIN
                    con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $6
                GROUP BY 
                    fp.ide_cndfp
            )
            SELECT 
                vp.ide_cndfp,
                vp.forma_pago,
                vp.num_facturas,
                vp.total_ventas_brutas,
                vp.total_cantidad,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                (vp.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) AS total_ventas_netas,
                (vp.total_cantidad - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad_neta,
                ROUND(
                    (vp.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $7 AND $8
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $9
                    ), 0), 
                2) AS porcentaje
            FROM 
                ventas_producto_forma_pago vp
            LEFT JOIN 
                notas_credito_producto_forma_pago nc ON vp.ide_cndfp = nc.ide_cndfp
            ORDER BY 
                total_ventas_netas DESC
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addIntParam(5, dtoIn.ide_inarti);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, dtoIn.fechaInicio);
        query.addStringParam(8, dtoIn.fechaFin);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }



    async getTopVendedoresProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_vendedor_producto AS (
                SELECT 
                    v.ide_vgven,
                    v.nombre_vgven,
                    COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                    SUM(cdf.total_ccdfa) AS ventas_brutas,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad,
                    SUM(cdf.total_ccdfa) AS total_bruto
                FROM 
                    cxc_cabece_factura cf
                JOIN 
                    ven_vendedor v ON cf.ide_vgven = v.ide_vgven
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $7
                GROUP BY 
                    v.ide_vgven, v.nombre_vgven
            ),
            notas_credito_vendedor_producto AS (
                SELECT 
                    cf.ide_vgven,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN 
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $8
                GROUP BY 
                    cf.ide_vgven
            )
            SELECT 
                vv.nombre_vgven AS vendedor,
                vv.num_facturas,
                vv.total_cantidad,
                vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0) AS total_ventas,
                vv.total_cantidad - COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_neta,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                ROUND((vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) / vv.num_facturas, 2) AS promedio_venta,
                ROUND(
                    (vv.total_bruto - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $5 AND $6
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $9
                    ), 0), 
                2) AS porcentaje
            FROM 
                ventas_vendedor_producto vv
            LEFT JOIN 
                notas_credito_vendedor_producto nc ON vv.ide_vgven = nc.ide_vgven
            ORDER BY 
                total_ventas DESC
            LIMIT ${dtoIn.limit || 10}
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addStringParam(5, dtoIn.fechaInicio);
        query.addStringParam(6, dtoIn.fechaFin);
        query.addIntParam(7, dtoIn.ide_inarti);
        query.addIntParam(8, dtoIn.ide_inarti);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }



    async getTotalVentasProductoPorIdCliente(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_tipo_identificacion AS (
                SELECT
                    d.ide_getid,
                    d.nombre_getid,
                    COUNT(DISTINCT a.ide_cccfa) AS num_facturas,
                    SUM(b.cantidad_ccdfa) AS cantidad_bruta,
                    SUM(b.total_ccdfa) AS ventas_brutas
                FROM
                    cxc_cabece_factura a
                INNER JOIN cxc_deta_factura b ON a.ide_cccfa = b.ide_cccfa
                INNER JOIN gen_persona c ON a.ide_geper = c.ide_geper
                INNER JOIN gen_tipo_identifi d ON c.ide_getid = d.ide_getid
                WHERE
                    a.fecha_emisi_cccfa >= $1
                    AND a.fecha_emisi_cccfa <= $2
                    AND b.ide_inarti = $3
                    AND a.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND a.ide_empr = ${dtoIn.ideEmpr} 
                GROUP BY
                    d.ide_getid, d.nombre_getid
            ),
            notas_credito_tipo_identificacion AS (
                SELECT
                    d.ide_getid,
                    SUM(e.cantidad_cpdno) AS cantidad_notas,
                    SUM(e.valor_cpdno) AS total_notas_credito
                FROM
                    cxp_cabecera_nota cn
                INNER JOIN cxp_detalle_nota e ON cn.ide_cpcno = e.ide_cpcno
                INNER JOIN cxc_cabece_factura a ON cn.num_doc_mod_cpcno LIKE '%' || lpad(a.secuencial_cccfa::text, 9, '0')
                INNER JOIN gen_persona c ON a.ide_geper = c.ide_geper
                INNER JOIN gen_tipo_identifi d ON c.ide_getid = d.ide_getid
                WHERE
                    cn.fecha_emisi_cpcno >= $4
                    AND cn.fecha_emisi_cpcno <= $5
                    AND e.ide_inarti = $6
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND a.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY
                    d.ide_getid
            )
            SELECT
                v.ide_getid,
                v.nombre_getid,
                v.num_facturas,
                v.cantidad_bruta,
                v.ventas_brutas,
                COALESCE(nc.cantidad_notas, 0) AS cantidad_notas,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                (v.cantidad_bruta - COALESCE(nc.cantidad_notas, 0)) AS cantidad_neta,
                (v.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) AS ventas_netas,
                ROUND(
                    (v.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(b2.total_ccdfa)
                        FROM cxc_deta_factura b2
                        INNER JOIN cxc_cabece_factura a2 ON b2.ide_cccfa = a2.ide_cccfa
                        WHERE a2.fecha_emisi_cccfa >= $7
                        AND a2.fecha_emisi_cccfa <= $8
                        AND b2.ide_inarti = $9
                        AND a2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                        AND a2.ide_empr = ${dtoIn.ideEmpr}
                    ), 0), 
                2) AS porcentaje
            FROM
                ventas_tipo_identificacion v
            LEFT JOIN
                notas_credito_tipo_identificacion nc ON v.ide_getid = nc.ide_getid
            ORDER BY
                ventas_netas DESC    
            LIMIT ${dtoIn.limit || 20}
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addStringParam(4, dtoIn.fechaInicio);
        query.addStringParam(5, dtoIn.fechaFin);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, dtoIn.fechaInicio);
        query.addStringParam(8, dtoIn.fechaFin);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createSelectQuery(query);
    }



    /**
  * Retorna el total de PROFORMAS mensuales de un producto en un periodo
  * @param dtoIn
  * @returns
  */
    async getProformasMensualesProducto(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const query = new SelectQuery(
            `
        WITH 
        proformas_mes AS (
            SELECT
                EXTRACT(MONTH FROM a.fecha_cccpr) AS mes,
                COUNT(cdf.ide_ccdpr) AS num_proformas,
                SUM(cdf.cantidad_ccdpr) AS cantidad_cotizada,
                SUM(cdf.total_ccdpr) AS total_cotizado,
                MAX(f.siglas_inuni) AS siglas_inuni
            FROM
                cxc_cabece_proforma a
            INNER JOIN cxc_deta_proforma cdf ON a.ide_cccpr = cdf.ide_cccpr
            INNER JOIN inv_articulo d ON cdf.ide_inarti = d.ide_inarti
            LEFT JOIN inv_unidad f ON d.ide_inuni = f.ide_inuni
            WHERE
                a.fecha_cccpr BETWEEN $1 AND $2
                AND cdf.ide_inarti = $3
                AND a.anulado_cccpr = false
                AND a.ide_empr = ${dtoIn.ideEmpr} 
            GROUP BY EXTRACT(MONTH FROM a.fecha_cccpr)
        ),
        
        facturas_efectivas AS (
            SELECT
                EXTRACT(MONTH FROM c.fecha_emisi_cccfa) AS mes,
                COUNT(DISTINCT c.ide_cccfa) AS cotizaciones_efectivas,
                SUM(d.cantidad_ccdfa) AS cantidad_efectiva
            FROM
                cxc_cabece_factura c
            INNER JOIN cxc_deta_factura d ON c.ide_cccfa = d.ide_cccfa
            WHERE
                c.fecha_emisi_cccfa BETWEEN $4 AND $5
                AND d.ide_inarti = $6
                AND c.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND c.num_proforma_cccfa IS NOT NULL
            GROUP BY EXTRACT(MONTH FROM c.fecha_emisi_cccfa)
        )
        SELECT
            gm.nombre_gemes,
            ${dtoIn.periodo} AS periodo,
            COALESCE(pm.num_proformas, 0) AS num_proformas,
            COALESCE(pm.cantidad_cotizada, 0) AS cantidad,
            COALESCE(pm.siglas_inuni, '') AS siglas_inuni,
            COALESCE(pm.total_cotizado, 0) AS total,
            COALESCE(fe.cotizaciones_efectivas, 0) AS cotizaciones_efectivas,
            COALESCE(fe.cantidad_efectiva, 0) AS cantidad_efectiva,
            CASE 
                WHEN COALESCE(pm.cantidad_cotizada, 0) = 0 THEN 0
                ELSE ROUND(
                    (COALESCE(fe.cantidad_efectiva, 0)::numeric / 
                    NULLIF(pm.cantidad_cotizada, 0)::numeric) * 100, 
                    2
                )
            END AS porcentaje_efectividad
        FROM
            gen_mes gm
        LEFT JOIN proformas_mes pm ON gm.ide_gemes = pm.mes
        LEFT JOIN facturas_efectivas fe ON gm.ide_gemes = fe.mes
        ORDER BY
            gm.ide_gemes
        `,
            dtoIn,
        );
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addStringParam(4, `${dtoIn.periodo}-01-01`);
        query.addStringParam(5, `${dtoIn.periodo}-12-31`);
        query.addIntParam(6, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    /**
     * Retorna el total de compras mensuales de un producto en un periodo
     * @param dtoIn
     * @returns
     */
    async getComprasMensuales(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
            dtoIn.ide_inarti = -1;
        }
        const query = new SelectQuery(
            `
    SELECT
        gm.nombre_gemes,
        ${dtoIn.periodo} as periodo,
        COALESCE(count(cdf.ide_cpcfa), 0) AS num_facturas,
        COALESCE(sum(cdf.cantidad_cpdfa), 0) AS cantidad,
        siglas_inuni,
        COALESCE(sum(cdf.valor_cpdfa), 0) AS total
    FROM
        gen_mes gm
    LEFT JOIN (
        SELECT
            EXTRACT(MONTH FROM fecha_emisi_cpcfa) AS mes,
            cdf.ide_cpcfa,
            cdf.cantidad_cpdfa,
            cdf.valor_cpdfa,
            siglas_inuni
        FROM
            cxp_cabece_factur a
        INNER JOIN
            cxp_detall_factur cdf ON a.ide_cpcfa = cdf.ide_cpcfa
        INNER JOIN 
            inv_articulo d ON cdf.ide_inarti = d.ide_inarti
        LEFT JOIN 
            inv_unidad f ON d.ide_inuni = f.ide_inuni 
        WHERE
            fecha_emisi_cpcfa  >=  $1 AND a.fecha_emisi_cpcfa <=  $2 
            AND cdf.ide_inarti = $3
            AND ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')} 
            AND a.ide_empr = ${dtoIn.ideEmpr} 
    ) cdf ON gm.ide_gemes = cdf.mes
    GROUP BY
        gm.nombre_gemes, gm.ide_gemes, siglas_inuni
    ORDER BY
        gm.ide_gemes       
        `,
            dtoIn,
        );
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addIntParam(3, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }


    /**
 * Retorna el total de ventas mensuales de un producto específico en un período
 * @param dtoIn
 * @returns
 */
    async getTotalVentasMensualesProducto(dtoIn: VentasMensualesDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        WITH FacturasFiltradas AS (
            SELECT 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa) AS mes,
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                SUM(CASE WHEN cf.base_grabada_cccfa IS NOT NULL THEN cf.base_grabada_cccfa ELSE 0 END) AS ventas12,
                SUM(CASE WHEN cf.base_tarifa0_cccfa IS NOT NULL THEN cf.base_tarifa0_cccfa ELSE 0 END) AS ventas0,
                SUM(cdf.total_ccdfa) AS ventas_brutas,
                SUM(cdf.cantidad_ccdfa) AS cantidad_vendida,
                SUM(cdf.total_ccdfa) AS total
            FROM 
                cxc_cabece_factura cf
            JOIN
                cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
            WHERE 
                cf.fecha_emisi_cccfa >= $1 AND cf.fecha_emisi_cccfa <= $2
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND cdf.ide_inarti = $5
            GROUP BY 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa),
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa)
        ),
        NotasCredito AS (
            SELECT 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno) AS mes,
                EXTRACT(YEAR FROM cn.fecha_emisi_cpcno) AS anio,
                SUM(cdn.valor_cpdno) AS total_nota_credito,
                SUM(cdn.cantidad_cpdno) AS cantidad_nota_credito
            FROM 
                cxp_cabecera_nota cn
            JOIN
                cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
            JOIN 
                cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
            WHERE 
                cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                AND cn.ide_cpeno = 1
                AND cn.ide_empr = ${dtoIn.ideEmpr}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND cdn.ide_inarti = $6
            GROUP BY 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno),
                EXTRACT(YEAR FROM cn.fecha_emisi_cpcno)
        )
        SELECT 
            gm.ide_gemes,
            gm.nombre_gemes,
            COALESCE(ff.num_facturas, 0) AS num_facturas,
            COALESCE(ff.ventas12, 0) AS ventas_con_iva,
            COALESCE(ff.ventas0, 0) AS ventas0,
            COALESCE(ff.cantidad_vendida, 0) AS cantidad_vendida,
            COALESCE(ff.ventas_brutas, 0) AS ventas_brutas,
            COALESCE(nc.total_nota_credito, 0) AS total_nota_credito,
            COALESCE(nc.cantidad_nota_credito, 0) AS cantidad_nota_credito,
            COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) AS ventas_netas,
            COALESCE(ff.cantidad_vendida, 0) - COALESCE(nc.cantidad_nota_credito, 0) AS cantidad_neta,
            COALESCE(ff.total, 0) - COALESCE(nc.total_nota_credito, 0) AS total_neto,
            ROUND(
                (COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) * 100.0 / 
                NULLIF((
                    SELECT SUM(cdf2.total_ccdfa)
                    FROM cxc_deta_factura cdf2
                    JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                    WHERE cf2.fecha_emisi_cccfa >= $7 AND cf2.fecha_emisi_cccfa <= $8
                    AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf2.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf2.ide_inarti = $9
                ), 0), 
            2) AS porcentaje_anual
        FROM 
            gen_mes gm
        LEFT JOIN 
            FacturasFiltradas ff ON gm.ide_gemes = ff.mes
        LEFT JOIN 
            NotasCredito nc ON gm.ide_gemes = nc.mes AND (ff.anio = nc.anio OR ff.anio IS NULL)
        ORDER BY 
            gm.ide_gemes
    `);

        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addStringParam(3, `${dtoIn.periodo}-01-01`);
        query.addStringParam(4, `${dtoIn.periodo}-12-31`);
        query.addIntParam(5, dtoIn.ide_inarti);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, `${dtoIn.periodo}-01-01`);
        query.addStringParam(8, `${dtoIn.periodo}-12-31`);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    async getTendenciaVentasDiaProducto(dtoIn: ClientesProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            WITH ventas_dia_semana AS (
                SELECT 
                    EXTRACT(DOW FROM cf.fecha_emisi_cccfa) AS num_dia,
                    TO_CHAR(cf.fecha_emisi_cccfa, 'Day') AS dia_semana,
                    COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                    SUM(cdf.total_ccdfa) AS total_ventas_brutas,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad_bruta,
                    AVG(cdf.total_ccdfa) AS promedio_venta
                FROM 
                    cxc_cabece_factura cf
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $3
                GROUP BY 
                    TO_CHAR(cf.fecha_emisi_cccfa, 'Day'), EXTRACT(DOW FROM cf.fecha_emisi_cccfa)
            ),
            notas_credito_dia_semana AS (
                SELECT 
                    EXTRACT(DOW FROM cn.fecha_emisi_cpcno) AS num_dia,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                WHERE 
                    cn.fecha_emisi_cpcno BETWEEN $4 AND $5
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $6
                GROUP BY 
                    EXTRACT(DOW FROM cn.fecha_emisi_cpcno)
            )
            SELECT 
                vd.num_dia,
                TRIM(vd.dia_semana) AS dia_semana,
                vd.num_facturas,
                vd.total_ventas_brutas,
                vd.total_cantidad_bruta,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                (vd.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) AS total_ventas_netas,
                (vd.total_cantidad_bruta - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad_neta,
                vd.promedio_venta,
                ROUND(
                    (vd.total_ventas_brutas - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.fecha_emisi_cccfa BETWEEN $7 AND $8
                        AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $9
                    ), 0), 
                2) AS porcentaje_total
            FROM 
                ventas_dia_semana vd
            LEFT JOIN 
                notas_credito_dia_semana nc ON vd.num_dia = nc.num_dia
            ORDER BY 
                vd.num_dia
        `);

        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addStringParam(4, dtoIn.fechaInicio);
        query.addStringParam(5, dtoIn.fechaFin);
        query.addIntParam(6, dtoIn.ide_inarti);
        query.addStringParam(7, dtoIn.fechaInicio);
        query.addStringParam(8, dtoIn.fechaFin);
        query.addIntParam(9, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }


    async getResumenVentasPeriodosProducto(dtoIn: IdProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`            
            WITH ventas_anio_producto AS (
                SELECT 
                    EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                    COUNT(DISTINCT cf.ide_cccfa) AS total_facturas,
                    SUM(cdf.total_ccdfa) AS total_ventas_bruto,
                    SUM(cdf.cantidad_ccdfa) AS total_cantidad_bruta,
                    AVG(cdf.total_ccdfa) AS promedio_venta_por_factura,
                    COUNT(DISTINCT cf.ide_geper) AS clientes_unicos,
                    COUNT(DISTINCT cf.ide_vgven) AS vendedores_activos
                FROM 
                    cxc_cabece_factura cf
                JOIN
                    cxc_deta_factura cdf ON cf.ide_cccfa = cdf.ide_cccfa
                WHERE 
                    cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdf.ide_inarti = $1
                GROUP BY 
                    EXTRACT(YEAR FROM cf.fecha_emisi_cccfa)
            ),
            notas_credito_anio_producto AS (
                SELECT 
                    EXTRACT(YEAR FROM cn.fecha_emisi_cpcno) AS anio,
                    SUM(cdn.valor_cpdno) AS total_notas_credito,
                    SUM(cdn.cantidad_cpdno) AS total_cantidad_notas
                FROM 
                    cxp_cabecera_nota cn
                JOIN
                    cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
                JOIN 
                    cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                WHERE 
                    cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND cdn.ide_inarti = $2
                GROUP BY 
                    EXTRACT(YEAR FROM cn.fecha_emisi_cpcno)
            )
            
            SELECT 
                vp.anio,
                vp.total_facturas,
                vp.total_ventas_bruto,
                vp.total_cantidad_bruta,
                COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(nc.total_cantidad_notas, 0) AS total_cantidad_notas,
                (vp.total_ventas_bruto - COALESCE(nc.total_notas_credito, 0)) AS total_ventas_neto,
                (vp.total_cantidad_bruta - COALESCE(nc.total_cantidad_notas, 0)) AS total_cantidad_neta,
                vp.promedio_venta_por_factura,
                vp.clientes_unicos,
                vp.vendedores_activos,
                ROUND(
                    (vp.total_ventas_bruto - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.total_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $3
                    ), 0), 
                2) AS porcentaje_ventas_totales,
                ROUND(
                    (vp.total_cantidad_bruta - COALESCE(nc.total_cantidad_notas, 0)) * 100.0 / 
                    NULLIF((
                        SELECT SUM(cdf2.cantidad_ccdfa)
                        FROM cxc_deta_factura cdf2
                        JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                        WHERE cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                        AND cf2.ide_empr = ${dtoIn.ideEmpr}
                        AND cdf2.ide_inarti = $4
                    ), 0), 
                2) AS porcentaje_cantidad_total
            FROM 
                ventas_anio_producto vp
            LEFT JOIN 
                notas_credito_anio_producto nc ON vp.anio = nc.anio
            ORDER BY 
                vp.anio DESC
        `);

        query.addIntParam(1, dtoIn.ide_inarti);
        query.addIntParam(2, dtoIn.ide_inarti);
        query.addIntParam(3, dtoIn.ide_inarti);
        query.addIntParam(4, dtoIn.ide_inarti);

        return await this.dataSource.createQuery(query);
    }





}