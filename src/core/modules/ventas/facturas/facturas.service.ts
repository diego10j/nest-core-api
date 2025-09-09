import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { CoreService } from 'src/core/core.service';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { FacturasDto } from './dto/facturas.dto';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { VariacionVentasPeriodoDto } from './dto/variacion-periodos.dto';
import { VentasDiariasDto } from './dto/ventas-diarias.dto';
import { VentasMensualesDto } from './dto/ventas-mensuales.dto';

@Injectable()
export class FacturasService extends BaseService {
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
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  async getTableQueryPuntosEmisionFacturas(dto: PuntosEmisionFacturasDto & HeaderParamsDto) {
    const condSucu = dto.filterSucu === true ? `and ide_sucu =  ${dto.ideSucu}` : '';
    const condition = `ide_empr = ${dto.ideEmpr} 
                           AND ide_cntdoc = ${this.variables.get('p_con_tipo_documento_factura')} 
                           ${condSucu}`;
    const dtoIn = {
      ...dto,
      module: 'cxc',
      tableName: 'datos_fac',
      primaryKey: 'ide_ccdaf',
      orderBy: { column: 'establecimiento_ccdfa' },
      condition,
    };
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
    const condEstadoFact = dtoIn.ide_ccefa
      ? `and a.ide_ccefa =  ${dtoIn.ide_ccefa}`
      : `and a.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} `;
    const condEstadoComp = dtoIn.ide_sresc ? `and a.ide_sresc =  ${dtoIn.ide_sresc}` : '';

    const query = new SelectQuery(
      `     
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
        `,
      dtoIn,
    );
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
   * 1. Variación diaria de ventas (últimos 10 días)
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
   * 5. Productos más vendidos (top 10)
   * @param dtoIn
   * @returns
   */
  async getTopProductos(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        WITH ventas_producto AS (
            SELECT 
                iart.ide_inarti,
                iart.uuid,
                iart.nombre_inarti AS producto,
                COUNT(DISTINCT cf.ide_cccfa) AS num_facturas,
                SUM(cdf.total_ccdfa) AS ventas_brutas,
                SUM(cdf.total_ccdfa) AS total_bruto
            FROM 
                cxc_deta_factura cdf
            JOIN 
                inv_articulo iart ON cdf.ide_inarti = iart.ide_inarti
            JOIN 
                cxc_cabece_factura cf ON cdf.ide_cccfa = cf.ide_cccfa
            WHERE 
                cf.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND iart.hace_kardex_inarti = true
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                iart.ide_inarti, iart.uuid, iart.nombre_inarti
        ),
        notas_credito_producto AS (
            SELECT 
                cdn.ide_inarti,
                SUM(cdn.valor_cpdno) AS total_notas_credito
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
            vp.uuid,
            vp.producto,
            vp.num_facturas,
            vp.ventas_brutas - COALESCE(nc.total_notas_credito, 0) AS total_ventas,
            COALESCE(nc.total_notas_credito, 0) AS total_notas_credito,
            ROUND(
                (vp.total_bruto - COALESCE(nc.total_notas_credito, 0)) * 100.0 / 
                NULLIF((SELECT SUM(total_ccdfa) 
                 FROM cxc_deta_factura cdf2
                 JOIN cxc_cabece_factura cf2 ON cdf2.ide_cccfa = cf2.ide_cccfa
                 WHERE cf2.fecha_emisi_cccfa BETWEEN $5 AND $6
                 AND cf2.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                 AND cf2.ide_empr = ${dtoIn.ideEmpr}), 0), 
            2) AS porcentaje
        FROM 
            ventas_producto vp
        LEFT JOIN 
            notas_credito_producto nc ON vp.ide_inarti = nc.ide_inarti
        ORDER BY 
            total_ventas DESC
        LIMIT 10`,
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

  async getUtilidadVentas(dtoIn: RangoFechasDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT 
            uv.ide_ccdfa,
            uv.ide_inarti,
            uv.fecha_emisi_cccfa,
            uv.secuencial_cccfa,
            uv.nom_geper,
            uv.nombre_inarti,
            uv.cantidad_ccdfa,
            uv.siglas_inuni,
            uv.precio_venta,
            uv.total_ccdfa,
            uv.nombre_vgven,
            uv.hace_kardex_inarti,
            uv.precio_compra,
            uv.utilidad,
            uv.utilidad_neta,
            uv.porcentaje_utilidad,
            uv.nota_credito,
            uv.fecha_ultima_compra
        FROM f_utilidad_ventas($1,$2,$3) uv
            `,
      dtoIn,
    );
    query.addParam(1, dtoIn.ideEmpr);
    query.addParam(2, dtoIn.fechaInicio);
    query.addParam(3, dtoIn.fechaFin);
    return await this.dataSource.createQuery(query);
  }
}
