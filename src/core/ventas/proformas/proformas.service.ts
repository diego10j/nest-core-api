import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { BaseService } from '../../../common/base-service';
import { CoreService } from 'src/core/core.service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ProformasDto } from './dto/proformas.dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { ProformasMensualesDto } from './dto/proformas-mensuales.dto';
import { getYear } from 'date-fns';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

@Injectable()
export class ProformasService extends BaseService {


    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_cxc_estado_factura_normal', // 0
        ]).then(result => {
            this.variables = result;
        });
    }


    async getProformas(dtoIn: ProformasDto & HeaderParamsDto) {
        const query = new SelectQuery(`     
        select
            a.ide_cccpr,
            a.secuencial_cccpr,
            a.fecha_cccpr,
            a.solicitante_cccpr,
            a.correo_cccpr,
            b.nom_usua,
            c.nombre_cctpr,
            a.total_cccpr,
            a.utilidad_cccpr,   
            v.nombre_vgven,
            f.fecha_emisi_cccfa,
            f.secuencial_cccfa,
            f.total_cccfa,
            f.ide_geper,
            g.nom_geper,
            a.anulado_cccpr,
            a.enviado_cccpr
        from
            cxc_cabece_proforma a
            inner join sis_usuario b on a.ide_usua = b.ide_usua
            left join cxc_tipo_proforma c on a.ide_cctpr = c.ide_cctpr
            left join ven_vendedor v on a.ide_vgven = v.ide_vgven
            left join cxc_cabece_factura f on a.secuencial_cccpr = f.num_proforma_cccfa  and f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}         
            left join gen_persona g on f.ide_geper = g.ide_geper
        where
            a.fecha_cccpr between $1 and $2
            and a.ide_empr = 0
        order by
            a.secuencial_cccpr desc
        `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }




    // Analisis de Datos    

    /**
    * Retorna el total de PROFORMAS mensuales  en un periodo 
    * @param dtoIn 
    * @returns 
   */
    async getProformasMensuales(dtoIn: ProformasMensualesDto & HeaderParamsDto) {
        if (dtoIn.periodo === 0) {
            dtoIn.periodo = getYear(new Date());
        }
        const query = new SelectQuery(`
        WITH
            proformas_mes AS (
                SELECT
                    EXTRACT(
                        MONTH
                        FROM
                            a.fecha_cccpr
                    ) AS mes,
                    COUNT(1) AS num_proformas,
                    SUM(a.total_cccpr) AS total_cotizado
                FROM
                    cxc_cabece_proforma a
                WHERE
                    a.fecha_cccpr BETWEEN $1 AND $2
                    AND a.anulado_cccpr = FALSE
                    AND a.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY
                    EXTRACT(MONTH FROM a.fecha_cccpr)
            ),
            facturas_efectivas AS (
                SELECT
                    EXTRACT(
                        MONTH
                        FROM
                            c.fecha_emisi_cccfa
                    ) AS mes,
                    COUNT(DISTINCT c.ide_cccfa) AS cotizaciones_efectivas,
                    SUM(c.total_cccfa) AS total_efectiva
                FROM
                    cxc_cabece_factura c
                WHERE
                    c.fecha_emisi_cccfa BETWEEN $3 AND $4
                    AND c.ide_ccefa  = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND c.num_proforma_cccfa IS NOT NULL
                GROUP BY
                    EXTRACT(MONTH FROM c.fecha_emisi_cccfa)
            )
        SELECT
            gm.nombre_gemes ,
            ${dtoIn.periodo} AS periodo,
            COALESCE(pm.num_proformas, 0) AS proformas_realizadas,
            COALESCE(pm.total_cotizado, 0) AS total_cotizado,
            COALESCE(fe.cotizaciones_efectivas, 0) AS cotizaciones_efectivas,
            COALESCE(fe.total_efectiva, 0) AS total_facturado,
            CASE
                WHEN COALESCE(pm.total_cotizado, 0) = 0 THEN 0
                ELSE ROUND((COALESCE(fe.total_efectiva, 0)::numeric / NULLIF(pm.total_cotizado, 0)::numeric) * 100, 2)
            END AS porcentaje_efectivo
        FROM
            gen_mes gm
            LEFT JOIN proformas_mes pm ON gm.ide_gemes = pm.mes
            LEFT JOIN facturas_efectivas fe ON gm.ide_gemes = fe.mes
        ORDER BY
            gm.ide_gemes
        `);
        query.addStringParam(1, `${dtoIn.periodo}-01-01`);
        query.addStringParam(2, `${dtoIn.periodo}-12-31`);
        query.addStringParam(3, `${dtoIn.periodo}-01-01`);
        query.addStringParam(4, `${dtoIn.periodo}-12-31`);
        return await this.dataSource.createQuery(query);
    }

    // 1. Productos más cotizados (Top 10)
    async getTopProductos(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`     
        SELECT
            a.ide_inarti,
            b.nombre_inarti,
            f.siglas_inuni,
            COUNT(DISTINCT c.ide_cccpr) AS veces_cotizado,
            SUM(a.cantidad_ccdpr) AS cantidad_total,
            SUM(a.total_ccdpr) AS valor_total,
            ROUND(AVG(a.utilidad_ccdpr), 2) AS utilidad_promedio
        FROM
            cxc_deta_proforma a
            INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
            INNER JOIN cxc_cabece_proforma c ON a.ide_cccpr = c.ide_cccpr
            LEFT JOIN inv_unidad f ON b.ide_inuni = f.ide_inuni
        WHERE
            c.fecha_cccpr BETWEEN $1 AND $2
            AND c.anulado_cccpr = FALSE
            AND c.ide_empr  = ${dtoIn.ideEmpr}
            AND b.hace_kardex_inarti = TRUE
        GROUP BY
            a.ide_inarti,
            b.nombre_inarti,
            f.siglas_inuni
        ORDER BY
            veces_cotizado DESC
        LIMIT  10
        `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    // 2. Productos con mayor utilidad
    async getTopProductosMayorUtilidad(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`   
        SELECT 
            a.ide_inarti,
            b.nombre_inarti,
            f.siglas_inuni,
            SUM(a.utilidad_ccdpr) AS utilidad_total,
            SUM(a.total_ccdpr) AS valor_total,
            ROUND((SUM(a.utilidad_ccdpr) / SUM(a.total_ccdpr)) * 100, 2) AS margen_utilidad
        FROM 
            cxc_deta_proforma a
        INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
        INNER JOIN cxc_cabece_proforma c ON a.ide_cccpr = c.ide_cccpr
        LEFT JOIN inv_unidad f ON b.ide_inuni = f.ide_inuni
        WHERE 
            c.fecha_cccpr BETWEEN $1 AND $2
            AND c.anulado_cccpr = false
            AND c.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            a.ide_inarti, b.nombre_inarti, f.siglas_inuni
        ORDER BY 
            utilidad_total DESC
        LIMIT 10
        `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    // 3. Efectividad por vendedor (Gráfico de pastel)
    async getEfectividadPorVendedor(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`   
        WITH cotizaciones_vendedor AS (
            SELECT 
                v.ide_vgven,
                v.nombre_vgven,
                COUNT(DISTINCT c.ide_cccpr) AS total_cotizaciones,
                COUNT(DISTINCT f.ide_cccfa) AS cotizaciones_efectivas
            FROM 
                cxc_cabece_proforma c
            LEFT JOIN ven_vendedor v ON c.ide_vgven = v.ide_vgven
            LEFT JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            WHERE 
                c.fecha_cccpr BETWEEN $1 AND $2
                AND c.anulado_cccpr = false
                AND c.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                v.ide_vgven, v.nombre_vgven
        )
        SELECT 
        COALESCE(nombre_vgven, 'Sin Vendedor')  AS vendedor,
            total_cotizaciones,
            cotizaciones_efectivas,
            ROUND((cotizaciones_efectivas::numeric / NULLIF(total_cotizaciones, 0)::numeric) * 100, 2) AS porcentaje_efectividad
        FROM 
            cotizaciones_vendedor
        ORDER BY 
            total_cotizaciones DESC
        `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


    // 4. Tendencia diaria de cotizaciones
    async getTendenciaDiaria(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`   
    SELECT 
        DATE_TRUNC('day', fecha_cccpr) AS fecha,
        COUNT(ide_cccpr) AS cantidad_cotizaciones,
        SUM(total_cccpr) AS valor_total
    FROM 
        cxc_cabece_proforma
    WHERE 
        fecha_cccpr BETWEEN $1 AND $2
        AND anulado_cccpr = false
        AND ide_empr = ${dtoIn.ideEmpr}
    GROUP BY 
        DATE_TRUNC('day', fecha_cccpr)
    ORDER BY 
        fecha
    `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }


    //5. Clientes que más cotizan (Top 10)
    async getTopClientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`   
        SELECT 
            p.ide_geper,
            p.nom_geper,
            COUNT(DISTINCT c.ide_cccpr) AS veces_cotizado,
            SUM(c.total_cccpr) AS valor_total,
            COUNT(DISTINCT f.ide_cccfa) AS cotizaciones_efectivas
        FROM 
            cxc_cabece_proforma c
        INNER JOIN gen_persona p ON c.identificac_cccpr = p.identificac_geper
        LEFT JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
        WHERE 
            c.fecha_cccpr BETWEEN $1 AND $2
            AND c.anulado_cccpr = false
            AND c.ide_empr  = ${dtoIn.ideEmpr}
        GROUP BY 
            p.ide_geper, p.nom_geper
        ORDER BY 
            3 DESC
        LIMIT 10
    `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    // 6. Tiempo promedio de conversión (cotización a factura)
    async getTiempoConversion(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`   
        SELECT 
            f_redondeo(AVG((f.fecha_emisi_cccfa - c.fecha_cccpr)::int) ,2)AS dias_promedio_conversion,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (f.fecha_emisi_cccfa - c.fecha_cccpr)::int) AS mediana_dias_conversion
        FROM 
            cxc_cabece_proforma c
        INNER JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa
        WHERE 
            c.fecha_cccpr BETWEEN $1 AND $2
            AND f.ide_ccefa  = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND c.anulado_cccpr = false
            AND c.ide_empr = ${dtoIn.ideEmpr}
    `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createSelectQuery(query);
    }

    // 7. Estado de cotizaciones (resumen ejecutivo)
    async getResumenCotizaciones(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`   
    SELECT 
        COUNT(*) AS total_cotizaciones,
        SUM(CASE WHEN anulado_cccpr THEN 1 ELSE 0 END) AS cotizaciones_anuladas,
        SUM(CASE WHEN NOT anulado_cccpr THEN 1 ELSE 0 END) AS cotizaciones_validas,
        SUM(CASE WHEN f.ide_cccfa IS NOT NULL THEN 1 ELSE 0 END) AS cotizaciones_convertidas,
        ROUND(SUM(CASE WHEN f.ide_cccfa IS NOT NULL THEN 1 ELSE 0 END)::numeric / 
            NULLIF(SUM(CASE WHEN NOT anulado_cccpr THEN 1 ELSE 0 END), 0)::numeric * 100, 2) AS tasa_conversion
    FROM 
        cxc_cabece_proforma c
    LEFT JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
    WHERE 
        c.fecha_cccpr BETWEEN $1 AND $2
        AND c.ide_empr = ${dtoIn.ideEmpr}
`);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createSelectQuery(query);
    }

    // 8. Variación mensual de cotizaciones
    async getVariacionCotizaciones(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`   
    WITH cotizaciones_mensuales AS (
        SELECT 
            EXTRACT(YEAR FROM fecha_cccpr) AS año,
            EXTRACT(MONTH FROM fecha_cccpr) AS mes,
            COUNT(ide_cccpr) AS cantidad,
            SUM(total_cccpr) AS valor_total
        FROM 
            cxc_cabece_proforma
        WHERE 
            fecha_cccpr BETWEEN DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year' AND CURRENT_DATE
            AND anulado_cccpr = false
            AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY 
            EXTRACT(YEAR FROM fecha_cccpr), EXTRACT(MONTH FROM fecha_cccpr)
    )
    SELECT 
        año,
        mes,
        cantidad,
        valor_total,
        LAG(cantidad) OVER (ORDER BY año, mes) AS cantidad_mes_anterior,
        LAG(valor_total) OVER (ORDER BY año, mes) AS valor_mes_anterior,
        ROUND((cantidad - LAG(cantidad) OVER (ORDER BY año, mes)) / NULLIF(LAG(cantidad) OVER (ORDER BY año, mes), 0)::numeric * 100, 2) AS variacion_cantidad,
        ROUND((valor_total - LAG(valor_total) OVER (ORDER BY año, mes)) / NULLIF(LAG(valor_total) OVER (ORDER BY año, mes), 0)::numeric * 100, 2) AS variacion_valor
    FROM 
        cotizaciones_mensuales
    ORDER BY 
        año, mes
`);
        return await this.dataSource.createSelectQuery(query);
    }

    //1. Segmentación de Clientes por Comportamiento
    async getComportamientoClientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`       
    WITH clientes_cotizaciones AS (
        SELECT
            p.ide_geper,
            p.nom_geper,
            COUNT(DISTINCT c.ide_cccpr) AS total_cotizaciones,
            COUNT(DISTINCT f.ide_cccfa) AS cotizaciones_efectivas,
            SUM(c.total_cccpr) AS monto_total_cotizado,
            SUM(f.total_cccfa) AS monto_total_facturado
        FROM
            cxc_cabece_proforma c
        INNER JOIN gen_persona p ON c.identificac_cccpr = p.identificac_geper
        LEFT JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
        WHERE
            c.fecha_cccpr BETWEEN $1 AND $2
            AND c.anulado_cccpr = false
            AND c.ide_empr =  ${dtoIn.ideEmpr}
        GROUP BY
            p.ide_geper, p.nom_geper
    )
    SELECT
        nom_geper AS cliente,
        total_cotizaciones,
        cotizaciones_efectivas,
        monto_total_cotizado,
        monto_total_facturado,
        ROUND((cotizaciones_efectivas::numeric / NULLIF(total_cotizaciones, 0)) * 100, 2) AS tasa_conversion,
        CASE
            WHEN cotizaciones_efectivas = 0 THEN 'Solo cotiza'
            WHEN cotizaciones_efectivas > 0 AND (cotizaciones_efectivas::numeric / total_cotizaciones) < 0.3 THEN 'Baja conversión'
            WHEN (cotizaciones_efectivas::numeric / total_cotizaciones) BETWEEN 0.3 AND 0.7 THEN 'Conversión media'
            ELSE 'Alta conversión'
        END AS segmento_cliente
    FROM
        clientes_cotizaciones
    ORDER BY
        monto_total_facturado DESC NULLS LAST`, dtoIn);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    // Cotizaciones Pendientes de Seguimiento (no convertidas)

    async getCotizacionesPendientes(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`      
    SELECT
        c.ide_cccpr,
        c.secuencial_cccpr,
        c.fecha_cccpr,
        p.nom_geper AS cliente,
        v.nombre_vgven AS vendedor,
        c.total_cccpr,
        CURRENT_DATE - c.fecha_cccpr AS dias_pendientes,
        u.nom_usua AS creador,
        c.observacion_cccpr
    FROM
        cxc_cabece_proforma c
    INNER JOIN gen_persona p ON c.identificac_cccpr = p.identificac_geper
    LEFT JOIN ven_vendedor v ON c.ide_vgven = v.ide_vgven
    INNER JOIN sis_usuario u ON c.ide_usua = u.ide_usua
    WHERE
        c.fecha_cccpr BETWEEN $1 AND $2
        AND c.anulado_cccpr = false
        AND c.ide_empr =  ${dtoIn.ideEmpr}
        AND NOT EXISTS (
            SELECT 1 FROM cxc_cabece_factura f 
            WHERE f.num_proforma_cccfa = c.secuencial_cccpr 
            AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
        )
    ORDER BY
    dias_pendientes DESC`);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    // 3. Análisis de Pérdidas (Cotizaciones no Convertidas)


    async getAnalisisPerdidas(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`      
    SELECT
    EXTRACT(MONTH FROM c.fecha_cccpr) AS mes,
    EXTRACT(YEAR FROM c.fecha_cccpr) AS anio,
    COUNT(*) AS cotizaciones_perdidas,
    SUM(c.total_cccpr) AS valor_perdido,
    STRING_AGG(DISTINCT p.nom_geper, ', ' ORDER BY p.nom_geper) AS clientes_afectados,
    ROUND(COUNT(*)::numeric / NULLIF((
        SELECT COUNT(*) 
        FROM cxc_cabece_proforma 
        WHERE fecha_cccpr BETWEEN $1 AND $2
        AND anulado_cccpr = false
        AND ide_empr =  ${dtoIn.ideEmpr}
    ), 0) * 100, 2) AS porcentaje_perdidas
    FROM
    cxc_cabece_proforma c
    INNER JOIN gen_persona p ON c.identificac_cccpr = p.identificac_geper
    WHERE
    c.fecha_cccpr BETWEEN $3 AND $4
    AND c.anulado_cccpr = false
    AND c.ide_empr =  ${dtoIn.ideEmpr}
    AND NOT EXISTS (
        SELECT 1 FROM cxc_cabece_factura f 
        WHERE f.num_proforma_cccfa = c.secuencial_cccpr 
        AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
    )
    GROUP BY
    EXTRACT(MONTH FROM c.fecha_cccpr),
    EXTRACT(YEAR FROM c.fecha_cccpr)
    ORDER BY
    1, 2
`);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.fechaInicio);
        query.addParam(4, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    // - 4. Efectividad por Tipo de Cotizacion

    async getEfectividadPorTipo(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`      
    SELECT
        c.ide_cctpr,
        t.nombre_cctpr AS tipo_producto,
        COUNT(DISTINCT c.ide_cccpr) AS total_cotizaciones,
        COUNT(DISTINCT f.ide_cccfa) AS cotizaciones_efectivas,
        ROUND(COUNT(DISTINCT f.ide_cccfa)::numeric / NULLIF(COUNT(DISTINCT c.ide_cccpr), 0) * 100, 2) AS tasa_conversion,
        SUM(c.total_cccpr) AS valor_cotizado,
        SUM(f.total_cccfa) AS valor_facturado
    FROM
        cxc_cabece_proforma c
    LEFT JOIN cxc_tipo_proforma t ON c.ide_cctpr = t.ide_cctpr
    LEFT JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
    WHERE
        c.fecha_cccpr  BETWEEN $1 AND $2
        AND c.anulado_cccpr = false
        AND c.ide_empr = ${dtoIn.ideEmpr}
    GROUP BY
        c.ide_cctpr,
        t.nombre_cctpr
    ORDER BY
        tasa_conversion DESC`);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

    // 5. Histórico de Conversión por Cliente

    async getHisConversionPorCliente(dtoIn: RangoFechasDto & HeaderParamsDto) {
        const query = new SelectQuery(`         
        SELECT
        p.ide_geper,
        p.nom_geper AS cliente,
        EXTRACT(YEAR FROM c.fecha_cccpr) AS año,
        EXTRACT(MONTH FROM c.fecha_cccpr) AS mes,
        COUNT(DISTINCT c.ide_cccpr) AS cotizaciones,
        COUNT(DISTINCT f.ide_cccfa) AS conversiones,
        ROUND(COUNT(DISTINCT f.ide_cccfa)::numeric / NULLIF(COUNT(DISTINCT c.ide_cccpr), 0) * 100, 2) AS tasa_conversion,
        SUM(c.total_cccpr) AS monto_cotizado,
        SUM(f.total_cccfa) AS monto_facturado
        FROM
        cxc_cabece_proforma c
        INNER JOIN gen_persona p ON c.identificac_cccpr = p.identificac_geper
        LEFT JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa AND f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
        WHERE
        c.fecha_cccpr BETWEEN $1 AND $2
        AND c.anulado_cccpr = false
        AND c.ide_empr =  ${dtoIn.ideEmpr}
        GROUP BY
        p.ide_geper, p.nom_geper, EXTRACT(YEAR FROM c.fecha_cccpr), EXTRACT(MONTH FROM c.fecha_cccpr)
        ORDER BY
        cliente, año, mes`, dtoIn);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return await this.dataSource.createQuery(query);
    }

}
