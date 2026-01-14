import { Injectable } from '@nestjs/common';
import { getYear } from 'date-fns';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
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

import { TopClientesDto } from './dto/top-clientes.dto';

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
    return this.dataSource.createQuery(query);
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
    LIMIT ${dtoIn.dias}
        `);
    return this.dataSource.createQuery(query);
  }

  /**
   * 2. Tendencias de ventas por día de la semana
   * @param dtoIn
   * @returns
   */
  async getTendenciaVentasDia(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        WITH Ventas AS (
            SELECT 
                EXTRACT(DOW FROM fecha_emisi_cccfa) AS num_dia,
                COUNT(ide_cccfa) AS num_facturas,
                SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas_brutas,
                SUM(base_grabada_cccfa) AS ventas_con_iva,
                SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas_sin_iva,
                SUM(valor_iva_cccfa) AS iva,
                AVG(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS promedio_venta
            FROM 
                cxc_cabece_factura
            WHERE 
                fecha_emisi_cccfa BETWEEN $1 AND $2
                AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(DOW FROM fecha_emisi_cccfa)
        ),
        NotasCredito AS (
            SELECT 
                EXTRACT(DOW FROM fecha_emisi_cpcno) AS num_dia,
                SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_nota_credito,
                COUNT(ide_cpcno) AS num_notas_credito
            FROM 
                cxp_cabecera_nota
            WHERE 
                fecha_emisi_cpcno BETWEEN $3 AND $4
                AND ide_cpeno = 1
                AND ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(DOW FROM fecha_emisi_cpcno)
        ),
        DiasSemanas AS (
            SELECT 
                0 AS num_dia, 'Domingo' AS dia_semana
            UNION SELECT 1, 'Lunes'
            UNION SELECT 2, 'Martes'
            UNION SELECT 3, 'Miércoles'
            UNION SELECT 4, 'Jueves'
            UNION SELECT 5, 'Viernes'
            UNION SELECT 6, 'Sábado'
        )
        SELECT 
            ds.num_dia,
            ds.dia_semana,
            COALESCE(v.num_facturas, 0) AS num_facturas,
            COALESCE(v.total_ventas_brutas, 0) AS total_ventas_brutas,
            COALESCE(v.ventas_con_iva, 0) AS ventas_con_iva,
            COALESCE(v.ventas_sin_iva, 0) AS ventas_sin_iva,
            COALESCE(v.iva, 0) AS iva,
            COALESCE(v.promedio_venta, 0) AS promedio_venta,
            COALESCE(nc.total_nota_credito, 0) AS total_nota_credito,
            COALESCE(nc.num_notas_credito, 0) AS num_notas_credito,
            COALESCE(v.total_ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) AS total_ventas_netas,
            CASE 
                WHEN COALESCE(v.total_ventas_brutas, 0) > 0 
                THEN ROUND((COALESCE(v.total_ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) / COALESCE(v.total_ventas_brutas, 1) * 100, 2)
                ELSE 0 
            END AS porcentaje_eficiencia,
            RANK() OVER (ORDER BY COALESCE(v.total_ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) DESC) AS ranking_ventas
        FROM 
            DiasSemanas ds
        LEFT JOIN 
            Ventas v ON ds.num_dia = v.num_dia
        LEFT JOIN 
            NotasCredito nc ON ds.num_dia = nc.num_dia
        ORDER BY 
            ds.num_dia
    `);
    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
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
                SUM(cf.base_grabada_cccfa) AS ventas_con_iva,
                SUM(cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa) AS ventas_sin_iva,
                SUM(cf.valor_iva_cccfa) AS iva_recaudado,
                SUM(cf.total_cccfa) AS total_bruto,
                AVG(cf.total_cccfa) AS promedio_venta_bruto
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
                COUNT(cn.ide_cpcno) AS num_notas_credito,
                SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno) AS total_notas_credito,
                AVG(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno) AS promedio_nota_credito
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
        ),
        total_ventas_empresa AS (
            SELECT 
                SUM(total_cccfa) AS venta_total_empresa
            FROM 
                cxc_cabece_factura
            WHERE 
                fecha_emisi_cccfa BETWEEN $5 AND $6
                AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND ide_empr = ${dtoIn.ideEmpr}
        )
        SELECT 
            vv.ide_vgven,
            vv.nombre_vgven AS vendedor,
            vv.num_facturas,
            vv.ventas_brutas AS ventas_brutas,
            vv.ventas_con_iva,
            vv.ventas_sin_iva,
            vv.iva_recaudado,
            COALESCE(nc.num_notas_credito, 0) AS num_notas_credito,
            COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
            COALESCE(nc.promedio_nota_credito, 0) AS promedio_nota_credito,
            (vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) AS ventas_netas,
            (vv.total_bruto - COALESCE(nc.total_notas_credito, 0)) AS total_neto,
            CASE 
                WHEN vv.num_facturas > 0 
                THEN ROUND((vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) / vv.num_facturas, 2)
                ELSE 0 
            END AS promedio_venta_neto,
            CASE 
                WHEN vv.ventas_brutas > 0 
                THEN ROUND((COALESCE(nc.total_notas_credito, 0) / vv.ventas_brutas * 100), 2)
                ELSE 0 
            END AS porcentaje_devolucion,
            CASE 
                WHEN tve.venta_total_empresa > 0 
                THEN ROUND(((vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) / tve.venta_total_empresa * 100), 2)
                ELSE 0 
            END AS porcentaje_participacion,
            RANK() OVER (ORDER BY (vv.ventas_brutas - COALESCE(nc.total_notas_credito, 0)) DESC) AS ranking
        FROM 
            ventas_vendedor vv
        LEFT JOIN 
            notas_credito_vendedor nc ON vv.ide_vgven = nc.ide_vgven
        CROSS JOIN
            total_ventas_empresa tve
        ORDER BY 
            ventas_netas DESC
        LIMIT 10
    `);

    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);
    query.addStringParam(5, dtoIn.fechaInicio);
    query.addStringParam(6, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
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
    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
  }

  /**
   * 7. Clientes más frecuentes (top 10)
   * @param dtoIn
   * @returns
   */
  async getTopClientes(dtoIn: TopClientesDto & HeaderParamsDto) {
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
                LIMIT ${dtoIn.limit} `,
      dtoIn,
    );
    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);
    query.addStringParam(5, dtoIn.fechaInicio);
    query.addStringParam(6, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
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
        and art.hace_kardex_inarti = true
    GROUP BY 
        art.ide_incate,
        COALESCE(cat.nombre_incate, 'SIN CATEGORÍA')
    ORDER BY 
        total_ventas DESC`);
    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);

    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
  }

  /**
   * 10.  Tasa de crecimiento mensual
   * @param dtoIn
   * @returns
   */
  async getTasaCrecimientoMensual(dtoIn: VentasMensualesDto & HeaderParamsDto) {
    const query = new SelectQuery(`       
        WITH meses_anios AS (
            SELECT 
                gm.ide_gemes AS mes_numero,
                gm.nombre_gemes AS mes_nombre,
                anio.anio
            FROM 
                gen_mes gm
            CROSS JOIN 
                (SELECT ${dtoIn.periodo}::INTEGER AS anio) anio
        ),
        ventas_mensuales AS (
            SELECT 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa) AS mes_numero,
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                SUM(cf.total_cccfa) AS total_ventas_bruto,
                SUM(cf.base_grabada_cccfa + cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa) AS ventas_brutas
            FROM 
                cxc_cabece_factura cf
            WHERE 
                (cf.fecha_emisi_cccfa BETWEEN $1 AND $2)
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa),
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa)
        ),
        notas_credito_mensual AS (
            SELECT 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno) AS mes_numero,
                EXTRACT(YEAR FROM cn.fecha_emisi_cpcno) AS anio,
                SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno) AS total_notas_credito,
                COUNT(cn.ide_cpcno) AS cantidad_notas_credito
            FROM 
                cxp_cabecera_nota cn
            WHERE 
                (cn.fecha_emisi_cpcno BETWEEN $3 AND $4)
                AND cn.ide_cpeno = 1
                AND cn.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno),
                EXTRACT(YEAR FROM cn.fecha_emisi_cpcno)
        ),
        ventas_netas AS (
            SELECT
                ma.mes_numero,
                ma.mes_nombre,
                ma.anio,
                COALESCE(vm.total_ventas_bruto, 0) AS total_ventas_bruto,
                COALESCE(vm.ventas_brutas, 0) AS ventas_brutas,
                COALESCE(ncm.total_notas_credito, 0) AS total_notas_credito,
                COALESCE(ncm.cantidad_notas_credito, 0) AS cantidad_notas_credito,
                (COALESCE(vm.total_ventas_bruto, 0) - COALESCE(ncm.total_notas_credito, 0)) AS ventas_netas
            FROM
                meses_anios ma
            LEFT JOIN
                ventas_mensuales vm ON ma.mes_numero = vm.mes_numero AND ma.anio = vm.anio
            LEFT JOIN
                notas_credito_mensual ncm ON ma.mes_numero = ncm.mes_numero AND ma.anio = ncm.anio
        ),
        ventas_anio_anterior AS (
            -- Datos de diciembre del año anterior para comparar con enero
            SELECT 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa) AS mes_numero,
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                SUM(cf.total_cccfa) AS total_ventas_bruto,
                SUM(cf.base_grabada_cccfa + cf.base_tarifa0_cccfa + cf.base_no_objeto_iva_cccfa) AS ventas_brutas,
                (SUM(cf.total_cccfa) - COALESCE((
                    SELECT SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno)
                    FROM cxp_cabecera_nota cn
                    WHERE EXTRACT(MONTH FROM cn.fecha_emisi_cpcno) = 12
                    AND EXTRACT(YEAR FROM cn.fecha_emisi_cpcno) = ${dtoIn.periodo - 1}
                    AND cn.ide_cpeno = 1
                    AND cn.ide_empr = ${dtoIn.ideEmpr}
                ), 0)) AS ventas_netas
            FROM 
                cxc_cabece_factura cf
            WHERE 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa) = 12
                AND EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) = ${dtoIn.periodo - 1}
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(MONTH FROM cf.fecha_emisi_cccfa),
                EXTRACT(YEAR FROM cf.fecha_emisi_cccfa)
        ),
        ventas_con_mes_anterior AS (
            SELECT 
                vn.*,
                CASE 
                    -- Para enero, usar diciembre del año anterior
                    WHEN vn.mes_numero = 1 THEN COALESCE((SELECT ventas_netas FROM ventas_anio_anterior), 0)
                    -- Para otros meses, usar el mes anterior del mismo año
                    ELSE LAG(vn.ventas_netas, 1) OVER (ORDER BY vn.anio, vn.mes_numero)
                END AS ventas_mes_anterior,
                -- Obtener el nombre del mes anterior para la comparación
                CASE 
                    WHEN vn.mes_numero = 1 THEN 'Diciembre'
                    ELSE LAG(vn.mes_nombre, 1) OVER (ORDER BY vn.anio, vn.mes_numero)
                END AS nombre_mes_anterior
            FROM 
                ventas_netas vn
        ),
        ventas_con_crecimiento AS (
            SELECT 
                vc.*,
                CASE 
                    -- Para enero, comparar con diciembre del año anterior
                    WHEN vc.mes_numero = 1 THEN 
                        CASE 
                            WHEN (SELECT ventas_netas FROM ventas_anio_anterior) IS NULL OR (SELECT ventas_netas FROM ventas_anio_anterior) = 0 THEN 0
                            ELSE ROUND(
                                (vc.ventas_netas - (SELECT ventas_netas FROM ventas_anio_anterior)) / 
                                (SELECT ventas_netas FROM ventas_anio_anterior) * 100, 
                            2)
                        END
                    -- Para otros meses, usar el cálculo normal
                    ELSE 
                        CASE 
                            WHEN LAG(vc.ventas_netas, 1) OVER (ORDER BY vc.anio, vc.mes_numero) IS NULL THEN 0
                            WHEN LAG(vc.ventas_netas, 1) OVER (ORDER BY vc.anio, vc.mes_numero) = 0 THEN 0
                            ELSE ROUND(
                                (vc.ventas_netas - LAG(vc.ventas_netas, 1) OVER (ORDER BY vc.anio, vc.mes_numero)) / 
                                LAG(vc.ventas_netas, 1) OVER (ORDER BY vc.anio, vc.mes_numero) * 100, 
                            2)
                        END
                END AS crecimiento_porcentual,
                CASE 
                    -- Para enero, comparar con diciembre del año anterior
                    WHEN vc.mes_numero = 1 THEN 
                        vc.ventas_netas - COALESCE((SELECT ventas_netas FROM ventas_anio_anterior), 0)
                    -- Para otros meses, usar el cálculo normal
                    ELSE 
                        CASE 
                            WHEN LAG(vc.ventas_netas, 1) OVER (ORDER BY vc.anio, vc.mes_numero) IS NULL THEN 0
                            ELSE (vc.ventas_netas - LAG(vc.ventas_netas, 1) OVER (ORDER BY vc.anio, vc.mes_numero))
                        END
                END AS crecimiento_absoluto
            FROM 
                ventas_con_mes_anterior vc
        )
        SELECT 
            vc.mes_numero,
            vc.mes_nombre,
            vc.anio,
            vc.total_ventas_bruto,
            vc.ventas_brutas,
            vc.total_notas_credito,
            vc.cantidad_notas_credito,
            vc.ventas_netas,
            vc.ventas_mes_anterior,
            vc.crecimiento_porcentual,
            vc.crecimiento_absoluto,
            CASE 
                WHEN vc.crecimiento_porcentual > 0 THEN 'CRECIMIENTO'
                WHEN vc.crecimiento_porcentual < 0 THEN 'DECRECIMIENTO'
                ELSE 'ESTABLE'
            END AS tendencia,
            CASE 
                WHEN vc.mes_numero = 1 THEN 'Diciembre ' || (${dtoIn.periodo} - 1)
                ELSE COALESCE(vc.nombre_mes_anterior, 'N/A') || ' ' || vc.anio
            END AS comparacion_con
        FROM 
            ventas_con_crecimiento vc
        ORDER BY 
            vc.anio, vc.mes_numero
    `);
    query.addStringParam(1, `${dtoIn.periodo}-01-01`);
    query.addStringParam(2, `${dtoIn.periodo}-12-31`);
    query.addStringParam(3, `${dtoIn.periodo}-01-01`);
    query.addStringParam(4, `${dtoIn.periodo}-12-31`);
    return this.dataSource.createQuery(query);
  }

  /**
   * 11.  Facturas con mayor valor
   * @param dtoIn
   * @returns
   */
  async getFacturasMayorValor(dtoIn: TopClientesDto & HeaderParamsDto) {
    const query = new SelectQuery(`      
            SELECT 
                cf.ide_cccfa,
                cf.secuencial_cccfa,
                p.nom_geper AS cliente,
                cf.fecha_emisi_cccfa,
                cf.total_cccfa AS total_bruto,
                COALESCE((
                    SELECT SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno)
                    FROM cxp_cabecera_nota cn
                    WHERE cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                        AND cn.fecha_emisi_cpcno BETWEEN $1 AND $2
                        AND cn.ide_cpeno = 1
                        AND cn.ide_empr = ${dtoIn.ideEmpr}
                ), 0) AS total_nota_credito,
                (cf.total_cccfa - COALESCE((
                    SELECT SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno)
                    FROM cxp_cabecera_nota cn
                    WHERE cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                        AND cn.fecha_emisi_cpcno BETWEEN $3 AND $4
                        AND cn.ide_cpeno = 1
                        AND cn.ide_empr = ${dtoIn.ideEmpr}
                ), 0)) AS total_real,
                v.nombre_vgven AS vendedor,
                fp.nombre_cndfp AS forma_pago,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 
                        FROM cxp_cabecera_nota cn 
                        WHERE cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
                            AND cn.fecha_emisi_cpcno BETWEEN $5 AND $6
                            AND cn.ide_cpeno = 1
                            AND cn.ide_empr = ${dtoIn.ideEmpr}
                    ) THEN 'CON NOTA CRÉDITO'
                    ELSE 'SIN NOTA CRÉDITO'
                END AS estado_nota_credito
            FROM 
                cxc_cabece_factura cf
            JOIN 
                gen_persona p ON cf.ide_geper = p.ide_geper
            LEFT JOIN 
                ven_vendedor v ON cf.ide_vgven = v.ide_vgven
            LEFT JOIN 
                con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
            WHERE 
                cf.fecha_emisi_cccfa BETWEEN $7 AND $8
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY 
                total_real DESC
            LIMIT ${dtoIn.limit}
        `);

    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);
    query.addStringParam(5, dtoIn.fechaInicio);
    query.addStringParam(6, dtoIn.fechaFin);
    query.addStringParam(7, dtoIn.fechaInicio);
    query.addStringParam(8, dtoIn.fechaFin);

    return this.dataSource.createQuery(query);
  }

  /**
   * 12.  Resumen Ventas por años
   * @param dtoIn
   * @returns
   */
  async getResumenVentasPeriodos(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(`            
            WITH ventas_anuales AS (
                SELECT 
                    EXTRACT(YEAR FROM fecha_emisi_cccfa) AS anio,
                    COUNT(ide_cccfa) AS total_facturas,
                    SUM(base_grabada_cccfa) AS base_grabada_cccfa,
                    SUM(valor_iva_cccfa) AS total_iva,
                    SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas_exentas,
                    SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS total_ventas_bruto,
                    COUNT(DISTINCT ide_geper) AS clientes_unicos,
                    COUNT(DISTINCT ide_vgven) AS vendedores_activos
                FROM 
                    cxc_cabece_factura
                WHERE 
                    ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    EXTRACT(YEAR FROM fecha_emisi_cccfa)
            ),
            notas_credito_anio AS (
                SELECT 
                    EXTRACT(YEAR FROM fecha_emisi_cpcno) AS anio,
                    SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_notas,
                    COUNT(ide_cpcno) AS cantidad_notas
                FROM 
                    cxp_cabecera_nota
                WHERE 
                    ide_cpeno = 1
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    EXTRACT(YEAR FROM fecha_emisi_cpcno)
            ),
            anos_completos AS (
                SELECT DISTINCT anio
                FROM (
                    SELECT EXTRACT(YEAR FROM fecha_emisi_cccfa) AS anio
                    FROM cxc_cabece_factura
                    WHERE ide_empr = ${dtoIn.ideEmpr}
                    UNION
                    SELECT EXTRACT(YEAR FROM fecha_emisi_cpcno) AS anio
                    FROM cxp_cabecera_nota
                    WHERE ide_empr = ${dtoIn.ideEmpr}
                ) todos_anos
                WHERE anio IS NOT NULL
            )
            SELECT 
                ac.anio,
                COALESCE(va.total_facturas, 0) AS total_facturas,
                COALESCE(va.base_grabada_cccfa, 0) AS base_grabada_cccfa,
                COALESCE(va.total_iva, 0) AS total_iva,
                COALESCE(va.ventas_exentas, 0) AS ventas_exentas,
                COALESCE(va.total_ventas_bruto, 0) AS total_ventas_bruto,
                COALESCE(nc.total_notas, 0) AS total_notas_credito,
                COALESCE(nc.cantidad_notas, 0) AS cantidad_notas_credito,
                COALESCE(va.total_ventas_bruto, 0) - COALESCE(nc.total_notas, 0) AS total_ventas_neto,
                COALESCE(va.clientes_unicos, 0) AS clientes_unicos,
                COALESCE(va.vendedores_activos, 0) AS vendedores_activos,
                CASE 
                    WHEN COALESCE(va.total_ventas_bruto, 0) > 0 
                    THEN ROUND((COALESCE(nc.total_notas, 0) / va.total_ventas_bruto * 100), 2)
                    ELSE 0 
                END AS porcentaje_devolucion,
                CASE 
                    WHEN COALESCE(va.total_facturas, 0) > 0 
                    THEN ROUND(va.total_ventas_bruto / va.total_facturas, 2)
                    ELSE 0 
                END AS promedio_venta_por_factura
            FROM 
                anos_completos ac
            LEFT JOIN 
                ventas_anuales va ON ac.anio = va.anio
            LEFT JOIN 
                notas_credito_anio nc ON ac.anio = nc.anio
            ORDER BY 
                ac.anio DESC
        `);

    return this.dataSource.createQuery(query);
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
                    SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_notas_credito_p1,
                    COUNT(ide_cpcno) AS cantidad_notas_p1
                FROM 
                    cxp_cabecera_nota
                WHERE 
                    EXTRACT(YEAR FROM fecha_emisi_cpcno) = $3
                    AND ide_cpeno = 1
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    EXTRACT(MONTH FROM fecha_emisi_cpcno)
            ),
            NotasCreditoPeriodo2 AS (
                SELECT 
                    EXTRACT(MONTH FROM fecha_emisi_cpcno) AS mes,
                    SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_notas_credito_p2,
                    COUNT(ide_cpcno) AS cantidad_notas_p2
                FROM 
                    cxp_cabecera_nota
                WHERE 
                    EXTRACT(YEAR FROM fecha_emisi_cpcno) = $4
                    AND ide_cpeno = 1
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    EXTRACT(MONTH FROM fecha_emisi_cpcno)
            )
            SELECT 
                gm.ide_gemes,
                gm.nombre_gemes AS mes,
                -- Facturas
                COALESCE(v1.facturas_p1, 0) AS facturas_p1,
                COALESCE(v2.facturas_p2, 0) AS facturas_p2,
                CASE 
                    WHEN COALESCE(v1.facturas_p1, 0) = 0 THEN 
                        CASE WHEN COALESCE(v2.facturas_p2, 0) > 0 THEN 100.00 ELSE 0 END
                    ELSE ROUND(
                        (COALESCE(v2.facturas_p2, 0) - COALESCE(v1.facturas_p1, 0)) * 100.0 / 
                        COALESCE(v1.facturas_p1, 1), 2
                    )
                END AS variacion_facturas,
                
                -- Notas de crédito
                COALESCE(nc1.cantidad_notas_p1, 0) AS cantidad_notas_p1,
                COALESCE(nc2.cantidad_notas_p2, 0) AS cantidad_notas_p2,
                COALESCE(nc1.total_notas_credito_p1, 0) AS total_notas_credito_p1,
                COALESCE(nc2.total_notas_credito_p2, 0) AS total_notas_credito_p2,
                
                -- Ventas netas (totales después de notas de crédito)
                COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0) AS ventas_netas_p1,
                COALESCE(v2.ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0) AS ventas_netas_p2,
                CASE 
                    WHEN (COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0)) = 0 THEN 
                        CASE WHEN (COALESCE(v2.ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0)) > 0 THEN 100.00 ELSE 0 END
                    ELSE ROUND(
                        ((COALESCE(v2.ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0)) - 
                         (COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0))) * 100.0 / 
                        (COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0)), 2
                    )
                END AS variacion_ventas_netas,
                
                -- Base 12 (gravada)
                COALESCE(v1.basegrabada_p1, 0) AS base12_p1,
                COALESCE(v2.basegrabada_p2, 0) AS base12_p2,
                CASE 
                    WHEN COALESCE(v1.basegrabada_p1, 0) = 0 THEN 
                        CASE WHEN COALESCE(v2.basegrabada_p2, 0) > 0 THEN 100.00 ELSE 0 END
                    ELSE ROUND(
                        (COALESCE(v2.basegrabada_p2, 0) - COALESCE(v1.basegrabada_p1, 0)) * 100.0 / 
                        COALESCE(v1.basegrabada_p1, 1), 2
                    )
                END AS variacion_base12,
                
                -- Base 0 (exenta + no objeto)
                COALESCE(v1.base0_p1, 0) AS base0_p1,
                COALESCE(v2.base0_p2, 0) AS base0_p2,
                CASE 
                    WHEN COALESCE(v1.base0_p1, 0) = 0 THEN 
                        CASE WHEN COALESCE(v2.base0_p2, 0) > 0 THEN 100.00 ELSE 0 END
                    ELSE ROUND(
                        (COALESCE(v2.base0_p2, 0) - COALESCE(v1.base0_p1, 0)) * 100.0 / 
                        COALESCE(v1.base0_p1, 1), 2
                    )
                END AS variacion_base0,
                
                -- IVA
                COALESCE(v1.iva_p1, 0) AS iva_p1,
                COALESCE(v2.iva_p2, 0) AS iva_p2,
                CASE 
                    WHEN COALESCE(v1.iva_p1, 0) = 0 THEN 
                        CASE WHEN COALESCE(v2.iva_p2, 0) > 0 THEN 100.00 ELSE 0 END
                    ELSE ROUND(
                        (COALESCE(v2.iva_p2, 0) - COALESCE(v1.iva_p1, 0)) * 100.0 / 
                        COALESCE(v1.iva_p1, 1), 2
                    )
                END AS variacion_iva,
                
                -- Ventas brutas (antes de notas de crédito)
                COALESCE(v1.total_ventas_p1, 0) AS ventas_brutas_p1,
                COALESCE(v2.total_ventas_p2, 0) AS ventas_brutas_p2,
                CASE 
                    WHEN COALESCE(v1.total_ventas_p1, 0) = 0 THEN 
                        CASE WHEN COALESCE(v2.total_ventas_p2, 0) > 0 THEN 100.00 ELSE 0 END
                    ELSE ROUND(
                        (COALESCE(v2.total_ventas_p2, 0) - COALESCE(v1.total_ventas_p1, 0)) * 100.0 / 
                        COALESCE(v1.total_ventas_p1, 1), 2
                    )
                END AS variacion_ventas_brutas,
                
                -- Indicadores de tendencia
                CASE 
                    WHEN (COALESCE(v2.ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0)) > 
                         (COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0)) THEN 'CRECIMIENTO'
                    WHEN (COALESCE(v2.ventas_p2, 0) - COALESCE(nc2.total_notas_credito_p2, 0)) < 
                         (COALESCE(v1.ventas_p1, 0) - COALESCE(nc1.total_notas_credito_p1, 0)) THEN 'DECRECIMIENTO'
                    ELSE 'ESTABLE'
                END AS tendencia
                
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
    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
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
    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
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

    return this.dataSource.createSelectQuery(query);
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
    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
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

    return this.dataSource.createQuery(query);
  }

  /**
   * Retorna el total de ventas por cada dia del mes
   * @param dtoIn
   * @returns
   */
  async getVentasPorDiaDelMes(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`   
            WITH DiasDelMes AS (
                SELECT generate_series(1, 31) AS dia
            ),
            VentasPorDia AS (
                SELECT 
                    EXTRACT(DAY FROM fecha_emisi_cccfa) AS dia,
                    COUNT(ide_cccfa) AS num_facturas,
                    SUM(total_cccfa) AS total_ventas_brutas
                FROM 
                    cxc_cabece_factura
                WHERE 
                    fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    EXTRACT(DAY FROM fecha_emisi_cccfa)
            ),
            NotasCreditoPorDia AS (
                SELECT 
                    EXTRACT(DAY FROM fecha_emisi_cpcno) AS dia,
                    SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_nota_credito
                FROM 
                    cxp_cabecera_nota
                WHERE 
                    fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND ide_cpeno = 1
                    AND ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    EXTRACT(DAY FROM fecha_emisi_cpcno)
            )
            SELECT 
                dm.dia,
                COALESCE(v.num_facturas, 0) AS num_facturas,
                COALESCE(v.total_ventas_brutas, 0) AS total_ventas_brutas,
                COALESCE(nc.total_nota_credito, 0) AS total_nota_credito,
                COALESCE(v.total_ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) AS total_ventas_netas,
                RANK() OVER (ORDER BY COALESCE(v.total_ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) DESC) AS ranking_ventas
            FROM 
                DiasDelMes dm
            LEFT JOIN 
                VentasPorDia v ON dm.dia = v.dia
            LEFT JOIN 
                NotasCreditoPorDia nc ON dm.dia = nc.dia
            ORDER BY 
                dm.dia
        `);

    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);

    return this.dataSource.createQuery(query);
  }

  async getKPIsVentas(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(`
            WITH ventas_periodo AS (
                SELECT 
                    COUNT(ide_cccfa) AS total_facturas,
                    SUM(total_cccfa) AS ventas_brutas,
                    SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas_base,
                    SUM(valor_iva_cccfa) AS iva_recaudado,
                    COUNT(DISTINCT ide_geper) AS clientes_activos,
                    COUNT(DISTINCT ide_vgven) AS vendedores_activos
                FROM cxc_cabece_factura
                WHERE fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND ide_empr = ${dtoIn.ideEmpr}
            ),
            notas_credito_periodo AS (
                SELECT 
                    COUNT(ide_cpcno) AS total_notas_credito,
                    SUM(base_grabada_cpcno + base_tarifa0_cpcno + base_no_objeto_iva_cpcno) AS total_notas_monto
                FROM cxp_cabecera_nota
                WHERE fecha_emisi_cpcno BETWEEN $3 AND $4
                    AND ide_cpeno = 1
                    AND ide_empr = ${dtoIn.ideEmpr}
            ),
            ventas_periodo_anterior AS (
                SELECT 
                    SUM(total_cccfa) AS ventas_brutas_anterior,
                    COUNT(ide_cccfa) AS total_facturas_anterior
                FROM cxc_cabece_factura
                WHERE fecha_emisi_cccfa BETWEEN $5 AND $6
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND ide_empr = ${dtoIn.ideEmpr}
            )
            SELECT 
                -- Ventas actuales
                vp.total_facturas,
                vp.ventas_brutas,
                vp.ventas_base,
                vp.iva_recaudado,
                vp.clientes_activos,
                vp.vendedores_activos,
                
                -- Notas de crédito
                nc.total_notas_credito,
                nc.total_notas_monto,
                
                -- Ventas netas
                (vp.ventas_brutas - COALESCE(nc.total_notas_monto, 0)) AS ventas_netas,
                (vp.ventas_base - COALESCE(nc.total_notas_monto, 0)) AS ventas_base_netas,
                
                -- Crecimiento vs período anterior
                vpa.ventas_brutas_anterior,
                vpa.total_facturas_anterior,
                CASE 
                    WHEN vpa.ventas_brutas_anterior > 0 
                    THEN ROUND((vp.ventas_brutas - vpa.ventas_brutas_anterior) / vpa.ventas_brutas_anterior * 100, 2)
                    ELSE 0 
                END AS crecimiento_ventas_porcentual,
                
                -- Promedios
                CASE 
                    WHEN vp.total_facturas > 0 
                    THEN ROUND(vp.ventas_brutas / vp.total_facturas, 2)
                    ELSE 0 
                END AS ticket_promedio,
                
                -- Porcentajes
                CASE 
                    WHEN vp.ventas_brutas > 0 
                    THEN ROUND((nc.total_notas_monto / vp.ventas_brutas * 100), 2)
                    ELSE 0 
                END AS tasa_devolucion,
                
                CASE 
                    WHEN vp.clientes_activos > 0 
                    THEN ROUND(vp.ventas_brutas / vp.clientes_activos, 2)
                    ELSE 0 
                END AS venta_por_cliente
                
            FROM ventas_periodo vp
            CROSS JOIN notas_credito_periodo nc
            CROSS JOIN ventas_periodo_anterior vpa
        `);

    // Calcular fechas del período anterior CORREGIDO
    const fechaInicio = new Date(dtoIn.fechaInicio);
    const fechaFin = new Date(dtoIn.fechaFin);

    // Convertir a timestamps para operaciones aritméticas
    const timestampInicio = fechaInicio.getTime();
    const timestampFin = fechaFin.getTime();

    // Calcular diferencia en milisegundos
    const diffMs = timestampFin - timestampInicio;

    // Calcular fechas del período anterior
    const fechaInicioAnterior = new Date(timestampInicio - diffMs - 1000 * 60 * 60 * 24);
    const fechaFinAnterior = new Date(timestampFin - diffMs - 1000 * 60 * 60 * 24);

    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);
    query.addStringParam(5, fechaInicioAnterior.toISOString().split('T')[0]);
    query.addStringParam(6, fechaFinAnterior.toISOString().split('T')[0]);

    return this.dataSource.createQuery(query);
  }

  async getProductosMasRentables(dtoIn: TopClientesDto & HeaderParamsDto) {
    const query = new SelectQuery(`
            WITH ventas_productos AS (
                SELECT 
                    art.ide_inarti,
                    art.nombre_inarti AS producto,
                    cat.nombre_incate AS categoria,
                    SUM(df.cantidad_ccdfa) AS cantidad_vendida,
                    SUM(df.cantidad_ccdfa * df.precio_ccdfa) AS ventas_brutas,
                    COUNT(DISTINCT cf.ide_cccfa) AS facturas_con_producto,
                    COUNT(DISTINCT cf.ide_geper) AS clientes_unicos,
                    CASE 
                        WHEN SUM(df.cantidad_ccdfa) > 0 
                        THEN ROUND(SUM(df.cantidad_ccdfa * df.precio_ccdfa) / SUM(df.cantidad_ccdfa), 4)
                        ELSE 0
                    END AS precio_venta_promedio
                FROM cxc_deta_factura df
                INNER JOIN cxc_cabece_factura cf ON df.ide_cccfa = cf.ide_cccfa
                INNER JOIN inv_articulo art ON df.ide_inarti = art.ide_inarti
                LEFT JOIN inv_categoria cat ON art.ide_incate = cat.ide_incate
                WHERE cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                    AND art.hace_kardex_inarti = true
                GROUP BY art.ide_inarti, art.nombre_inarti, cat.nombre_incate
                HAVING SUM(df.cantidad_ccdfa) > 0
            ),
            costos_estrategia AS (
                -- Estrategia 1: Último costo antes del período
                SELECT DISTINCT ON (dci.ide_inarti)
                    dci.ide_inarti,
                    dci.precio_indci AS costo_unitario,
                    1 AS prioridad
                FROM inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.fecha_trans_incci <= $3
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    AND tci.signo_intci > 0
                    AND dci.ide_inarti IN (SELECT ide_inarti FROM ventas_productos)
                ORDER BY dci.ide_inarti, cci.fecha_trans_incci DESC, dci.ide_indci DESC
            ),
            costos_estrategia_2 AS (
                -- Estrategia 2: Costo promedio ponderado histórico
                SELECT 
                    dci.ide_inarti,
                    CASE 
                        WHEN SUM(dci.cantidad_indci) > 0 
                        THEN ROUND(SUM(dci.precio_indci * dci.cantidad_indci) / SUM(dci.cantidad_indci), 4)
                        ELSE NULL
                    END AS costo_unitario,
                    2 AS prioridad
                FROM inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.fecha_trans_incci <= $4
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    AND tci.signo_intci > 0
                    AND dci.ide_inarti IN (SELECT ide_inarti FROM ventas_productos)
                GROUP BY dci.ide_inarti
            ),
            costos_estrategia_3 AS (
                -- Estrategia 3: Cualquier costo disponible (sin filtro de fecha)
                SELECT DISTINCT ON (dci.ide_inarti)
                    dci.ide_inarti,
                    dci.precio_indci AS costo_unitario,
                    3 AS prioridad
                FROM inv_det_comp_inve dci
                INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
                INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
                INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
                WHERE cci.ide_inepi = ${this.variables.get('p_inv_estado_normal')}
                    AND cci.ide_empr = ${dtoIn.ideEmpr}
                    AND tci.signo_intci > 0
                    AND dci.ide_inarti IN (SELECT ide_inarti FROM ventas_productos)
                ORDER BY dci.ide_inarti, cci.fecha_trans_incci DESC, dci.ide_indci DESC
            ),
            costos_combinados AS (
                -- Combinar todas las estrategias y tomar la de mayor prioridad (menor número)
                SELECT DISTINCT ON (ide_inarti)
                    ide_inarti,
                    costo_unitario,
                    prioridad
                FROM (
                    SELECT * FROM costos_estrategia
                    UNION ALL
                    SELECT * FROM costos_estrategia_2 WHERE costo_unitario IS NOT NULL
                    UNION ALL
                    SELECT * FROM costos_estrategia_3
                ) AS todos_costos
                WHERE costo_unitario IS NOT NULL
                ORDER BY ide_inarti, prioridad ASC
            ),
            productos_con_costos AS (
                SELECT 
                    vp.*,
                    COALESCE(cc.costo_unitario, 0) AS costo_unitario,
                    (vp.cantidad_vendida * COALESCE(cc.costo_unitario, 0)) AS costo_total_ventas,
                    (vp.ventas_brutas - (vp.cantidad_vendida * COALESCE(cc.costo_unitario, 0))) AS utilidad_bruta,
                    CASE 
                        WHEN vp.ventas_brutas > 0 
                        THEN (vp.ventas_brutas - (vp.cantidad_vendida * COALESCE(cc.costo_unitario, 0))) / vp.ventas_brutas * 100
                        ELSE 0 
                    END AS margen_porcentual,
                    -- Indicador de qué estrategia se usó para el costo
                    CASE 
                        WHEN cc.prioridad = 1 THEN 'ÚLTIMO_COSTO'
                        WHEN cc.prioridad = 2 THEN 'COSTO_PROMEDIO'
                        WHEN cc.prioridad = 3 THEN 'COSTO_HISTORICO'
                        ELSE 'SIN_COSTO'
                    END AS estrategia_costo
                FROM ventas_productos vp
                LEFT JOIN costos_combinados cc ON vp.ide_inarti = cc.ide_inarti
                WHERE (vp.ventas_brutas - (vp.cantidad_vendida * COALESCE(cc.costo_unitario, 0))) > 0
            )
            SELECT 
                producto,
                categoria,
                cantidad_vendida,
                ventas_brutas,
                costo_unitario,
                costo_total_ventas,
                utilidad_bruta,
                ROUND(margen_porcentual, 2) AS margen_porcentual,
                CASE 
                    WHEN cantidad_vendida > 0 
                    THEN ROUND(utilidad_bruta / cantidad_vendida, 4)
                    ELSE 0 
                END AS utilidad_por_unidad,
                precio_venta_promedio,
                facturas_con_producto,
                clientes_unicos,
                CASE 
                    WHEN facturas_con_producto > 0 
                    THEN ROUND(cantidad_vendida::DECIMAL / facturas_con_producto, 2)
                    ELSE 0 
                END AS rotacion_por_factura,
                CASE 
                    WHEN clientes_unicos > 0 
                    THEN ROUND(utilidad_bruta / clientes_unicos, 2)
                    ELSE 0 
                END AS utilidad_por_cliente,
                CASE 
                    WHEN margen_porcentual > 50 THEN 'MUY ALTA RENTABILIDAD'
                    WHEN margen_porcentual > 30 THEN 'ALTA RENTABILIDAD'
                    WHEN margen_porcentual > 15 THEN 'RENTABILIDAD MEDIA'
                    WHEN margen_porcentual > 5 THEN 'BAJA RENTABILIDAD'
                    WHEN margen_porcentual > 0 THEN 'MARGEN MÍNIMO'
                    ELSE 'PÉRDIDA'
                END AS clasificacion_rentabilidad,
                estrategia_costo,
                RANK() OVER (ORDER BY utilidad_bruta DESC) AS ranking_utilidad_total,
                RANK() OVER (ORDER BY margen_porcentual DESC NULLS LAST) AS ranking_margen,
                -- Puntaje combinado para ordenamiento final
                (utilidad_bruta * 0.6 + margen_porcentual * 0.4) AS puntaje_rentabilidad
            FROM productos_con_costos
            ORDER BY puntaje_rentabilidad DESC
            LIMIT ${dtoIn.limit}
        `);

    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    query.addStringParam(3, dtoIn.fechaFin);
    query.addStringParam(4, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  async getTotalClientesPorProvincia(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(`
        SELECT p.ide_geprov,
        COALESCE(p.nombre_geprov, 'NO ASIGNADA') AS provincia,
        COUNT(per.ide_geper) AS cantidad_clientes,
        ROUND(COUNT(per.ide_geper) * 100.0 / (SELECT COUNT(*) FROM public.gen_persona), 2) AS porcentaje
        FROM public.gen_persona per
        LEFT JOIN public.gen_provincia p ON per.ide_geprov = p.ide_geprov
        WHERE per.es_cliente_geper = true
        AND ide_empr = ${dtoIn.ideEmpr}
        GROUP BY p.ide_geprov, p.nombre_geprov
        ORDER BY cantidad_clientes DESC   
    `);
    return this.dataSource.createQuery(query);
  }

  async getTopClientesFacturas(dtoIn: TopClientesDto & HeaderParamsDto) {
    const limitConfig = isDefined(dtoIn.limit) ? `LIMIT ${dtoIn.limit}` : '';
    const query = new SelectQuery(
      `
        SELECT
            g.ide_geper,
            upper(g.nom_geper) as nom_geper,
            COUNT(1) AS num_facturas
        FROM
            cxc_cabece_factura cf
            INNER JOIN gen_persona g ON g.ide_geper = cf.ide_geper
        WHERE
            cf.fecha_emisi_cccfa BETWEEN $1 AND $2
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.ide_empr = ${dtoIn.ideEmpr} 
        GROUP BY
            g.ide_geper,
            g.nom_geper
        ORDER BY
            num_facturas  DESC
        ${limitConfig}`,
      dtoIn,
    );
    query.addStringParam(1, dtoIn.fechaInicio);
    query.addStringParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  async getTotalClientesPorPeriodo(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(`
            WITH periodos AS (
                SELECT 
                    EXTRACT(YEAR FROM fecha_ingre) AS anio
                FROM gen_persona 
                WHERE fecha_ingre IS NOT NULL 
                    AND ide_empr = ${dtoIn.ideEmpr}
                    AND es_cliente_geper = true
                GROUP BY EXTRACT(YEAR FROM fecha_ingre)
                
                UNION
                
                SELECT 
                    EXTRACT(YEAR FROM fecha_emisi_cccfa) AS anio
                FROM cxc_cabece_factura 
                WHERE ide_empr = ${dtoIn.ideEmpr}
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                GROUP BY EXTRACT(YEAR FROM fecha_emisi_cccfa)
            ),
            clientes_nuevos AS (
                SELECT 
                    EXTRACT(YEAR FROM fecha_ingre) AS anio,
                    COUNT(ide_geper) AS total_nuevos
                FROM gen_persona
                WHERE fecha_ingre IS NOT NULL
                    AND ide_empr = ${dtoIn.ideEmpr}
                    AND es_cliente_geper = true
                GROUP BY EXTRACT(YEAR FROM fecha_ingre)
            ),
            clientes_activos AS (
                SELECT 
                    EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                    COUNT(DISTINCT cf.ide_geper) AS total_activos
                FROM cxc_cabece_factura cf
                WHERE cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY EXTRACT(YEAR FROM cf.fecha_emisi_cccfa)
            ),
            clientes_existentes AS (
                SELECT 
                    anio,
                    COUNT(ide_geper) AS total_existentes
                FROM (
                    SELECT 
                        p.anio,
                        gp.ide_geper
                    FROM periodos p
                    CROSS JOIN gen_persona gp
                    WHERE gp.fecha_ingre IS NOT NULL
                        AND gp.ide_empr = ${dtoIn.ideEmpr}
                        AND gp.fecha_ingre <= MAKE_DATE(p.anio::INTEGER, 12, 31)
                        AND gp.es_cliente_geper = true
                    GROUP BY p.anio, gp.ide_geper
                ) sub
                GROUP BY anio
            )
            SELECT 
                p.anio,
                COALESCE(cn.total_nuevos, 0) AS total_clientes_nuevos,
                COALESCE(ca.total_activos, 0) AS total_clientes_activos,
                COALESCE(ce.total_existentes, 0) AS total_clientes_existentes,
                LAG(cn.total_nuevos) OVER (ORDER BY p.anio) AS clientes_nuevos_anio_anterior,
                CASE 
                    WHEN LAG(cn.total_nuevos) OVER (ORDER BY p.anio) IS NOT NULL 
                        AND LAG(cn.total_nuevos) OVER (ORDER BY p.anio) != 0 THEN
                        ROUND(((cn.total_nuevos - LAG(cn.total_nuevos) OVER (ORDER BY p.anio)) * 100.0 / 
                              LAG(cn.total_nuevos) OVER (ORDER BY p.anio)), 2)
                    ELSE NULL
                END AS crecimiento_porcentual
            FROM periodos p
            LEFT JOIN clientes_nuevos cn ON p.anio = cn.anio
            LEFT JOIN clientes_activos ca ON p.anio = ca.anio
            LEFT JOIN clientes_existentes ce ON p.anio = ce.anio
            ORDER BY p.anio DESC
        `);

    return this.dataSource.createQuery(query);
  }

  async getTotalClientesPorPeriodoVendedor(dtoIn: IdeDto & HeaderParamsDto) {
    const query = new SelectQuery(`
            WITH vendedores AS (
                SELECT DISTINCT 
                    v.ide_vgven,
                    v.nombre_vgven
                FROM ven_vendedor v
                WHERE v.ide_empr = ${dtoIn.ideEmpr}
                AND  v.ide_vgven = ${dtoIn.ide}
            ),
            periodos AS (
                SELECT 
                    EXTRACT(YEAR FROM fecha_ingre) AS anio
                FROM gen_persona 
                WHERE fecha_ingre IS NOT NULL 
                    AND ide_empr = ${dtoIn.ideEmpr}
                    AND es_cliente_geper = true
                GROUP BY EXTRACT(YEAR FROM fecha_ingre)
                
                UNION
                
                SELECT 
                    EXTRACT(YEAR FROM fecha_emisi_cccfa) AS anio
                FROM cxc_cabece_factura 
                WHERE ide_empr = ${dtoIn.ideEmpr}
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                GROUP BY EXTRACT(YEAR FROM fecha_emisi_cccfa)
            ),
            clientes_nuevos_vendedor AS (
                SELECT 
                    EXTRACT(YEAR FROM gp.fecha_ingre) AS anio,
                    gp.ide_vgven,
                    COUNT(gp.ide_geper) AS total_nuevos
                FROM gen_persona gp
                WHERE gp.fecha_ingre IS NOT NULL
                    AND gp.ide_empr = ${dtoIn.ideEmpr}
                    AND gp.es_cliente_geper = true
                GROUP BY EXTRACT(YEAR FROM gp.fecha_ingre), gp.ide_vgven
            ),
            clientes_activos_vendedor AS (
                SELECT 
                    EXTRACT(YEAR FROM cf.fecha_emisi_cccfa) AS anio,
                    cf.ide_vgven,
                    COUNT(DISTINCT cf.ide_geper) AS total_activos
                FROM cxc_cabece_factura cf
                WHERE cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY EXTRACT(YEAR FROM cf.fecha_emisi_cccfa), cf.ide_vgven
            ),
            clientes_existentes_vendedor AS (
                SELECT 
                    p.anio,
                    gp.ide_vgven,
                    COUNT(DISTINCT gp.ide_geper) AS total_existentes
                FROM periodos p
                CROSS JOIN gen_persona gp
                WHERE gp.fecha_ingre IS NOT NULL
                    AND gp.ide_empr = ${dtoIn.ideEmpr}
                    AND gp.es_cliente_geper = true
                    AND gp.fecha_ingre <= MAKE_DATE(p.anio::INTEGER, 12, 31)
                GROUP BY p.anio, gp.ide_vgven
            ),
            totales_por_vendedor AS (
                SELECT 
                    p.anio,
                    v.ide_vgven,
                    v.nombre_vgven,
                    COALESCE(cnv.total_nuevos, 0) AS total_clientes_nuevos,
                    COALESCE(cav.total_activos, 0) AS total_clientes_activos,
                    COALESCE(cev.total_existentes, 0) AS total_clientes_existentes
                FROM periodos p
                CROSS JOIN vendedores v
                LEFT JOIN clientes_nuevos_vendedor cnv ON p.anio = cnv.anio AND v.ide_vgven = cnv.ide_vgven
                LEFT JOIN clientes_activos_vendedor cav ON p.anio = cav.anio AND v.ide_vgven = cav.ide_vgven
                LEFT JOIN clientes_existentes_vendedor cev ON p.anio = cev.anio AND v.ide_vgven = cev.ide_vgven
            )
            SELECT 
                anio,
                ide_vgven,
                nombre_vgven,
                total_clientes_nuevos,
                total_clientes_activos,
                total_clientes_existentes,
                LAG(total_clientes_nuevos) OVER (PARTITION BY ide_vgven ORDER BY anio) AS clientes_nuevos_anio_anterior,
                CASE 
                    WHEN LAG(total_clientes_nuevos) OVER (PARTITION BY ide_vgven ORDER BY anio) IS NOT NULL 
                        AND LAG(total_clientes_nuevos) OVER (PARTITION BY ide_vgven ORDER BY anio) != 0 THEN
                        ROUND(((total_clientes_nuevos - LAG(total_clientes_nuevos) OVER (PARTITION BY ide_vgven ORDER BY anio)) * 100.0 / 
                              LAG(total_clientes_nuevos) OVER (PARTITION BY ide_vgven ORDER BY anio)), 2)
                    ELSE NULL
                END AS crecimiento_porcentual,
                -- Métricas adicionales de performance
                CASE 
                    WHEN total_clientes_existentes > 0 THEN
                        ROUND((total_clientes_activos * 100.0 / total_clientes_existentes), 2)
                    ELSE 0
                END AS tasa_activacion,
                CASE 
                    WHEN total_clientes_existentes > 0 THEN
                        ROUND((total_clientes_nuevos * 100.0 / total_clientes_existentes), 2)
                    ELSE 0
                END AS tasa_crecimiento
            FROM totales_por_vendedor
            WHERE total_clientes_nuevos > 0 OR total_clientes_activos > 0 OR total_clientes_existentes > 0
            ORDER BY anio DESC, total_clientes_activos DESC, total_clientes_nuevos DESC
        `);

    return this.dataSource.createQuery(query);
  }

  async getResumenClientesPorVendedor(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(`
            WITH clientes_recientes AS (
                SELECT DISTINCT ide_geper
                FROM cxc_cabece_factura
                WHERE fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '6 months'
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND ide_empr = ${dtoIn.ideEmpr}
            ),
            clientes_activos_anio AS (
                SELECT DISTINCT ide_geper, ide_vgven
                FROM cxc_cabece_factura
                WHERE fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '1 year'
                    AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND ide_empr = ${dtoIn.ideEmpr}
            )
            SELECT 
                COALESCE(v.ide_vgven, 0) as ide_vgven,
                COALESCE(v.nombre_vgven, 'SIN VENDEDOR') as nombre_vgven,
                COUNT(gp.ide_geper) AS total_clientes_asignados,
                COUNT(CASE WHEN gp.fecha_ingre >= CURRENT_DATE - INTERVAL '1 year' THEN 1 END) AS total_clientes_nuevos,
                COUNT(CASE WHEN ca.ide_geper IS NOT NULL THEN 1 END) AS total_clientes_activos,
                COUNT(CASE WHEN gp.ide_geper NOT IN (SELECT ide_geper FROM clientes_recientes) THEN 1 END) AS clientes_sin_seguimiento
            FROM gen_persona gp
            LEFT JOIN ven_vendedor v ON gp.ide_vgven = v.ide_vgven 
                AND v.ide_empr = ${dtoIn.ideEmpr}
            LEFT JOIN clientes_activos_anio ca ON gp.ide_geper = ca.ide_geper 
                AND (gp.ide_vgven = ca.ide_vgven OR (gp.ide_vgven IS NULL AND ca.ide_vgven IS NULL))
            WHERE gp.ide_empr = ${dtoIn.ideEmpr}
                AND gp.es_cliente_geper = true
            GROUP BY v.ide_vgven, v.nombre_vgven
            ORDER BY total_clientes_activos DESC
        `);

    return this.dataSource.createQuery(query);
  }
}
