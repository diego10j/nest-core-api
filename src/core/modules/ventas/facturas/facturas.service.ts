import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { CoreService } from 'src/core/core.service';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { FacturasDto } from './dto/facturas.dto';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';


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


    async getFacturasAnuladas(dtoIn: FacturasDto & HeaderParamsDto) {
        dtoIn.ide_ccefa = 1;
        return this.getFacturas(dtoIn);
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


    async getFacturasConNotasCredito(dtoIn: FacturasDto & HeaderParamsDto) {
        const condPtoEmision = dtoIn.ide_ccdaf ? `and a.ide_ccdaf =  ${dtoIn.ide_ccdaf}` : '';
        const condEstadoFact = dtoIn.ide_ccefa
            ? `and a.ide_ccefa =  ${dtoIn.ide_ccefa}`
            : `and a.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} `;
        const condEstadoComp = dtoIn.ide_sresc ? `and a.ide_sresc =  ${dtoIn.ide_sresc}` : '';

        const query = new SelectQuery(
            `     
            SELECT 
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
                fecha_trans_cccfa,
                d.ide_srcom,
                a.ide_geper,
                a.ide_cnccc,
                a.usuario_ingre,
                
                -- Indicador de Notas de Crédito
                CASE 
                    WHEN nc.ide_cpcno IS NOT NULL THEN 'SI'
                    ELSE 'NO'
                END AS tiene_nota_credito,
                
                -- Contador de NC
                COUNT(nc.ide_cpcno) AS cantidad_notas_credito,
                
                -- Total de NC asociadas
                COALESCE(SUM(nc.total_cpcno), 0) AS total_notas_credito,
                
                -- Lista de números de NC
                STRING_AGG(nc.numero_cpcno, ', ') AS numeros_notas_credito,
                
                -- Neto después de NC
                (a.total_cccfa - COALESCE(SUM(nc.total_cpcno), 0)) AS total_neto
    
            FROM
                cxc_cabece_factura a
                INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
                INNER JOIN cxc_datos_fac c ON a.ide_ccdaf = c.ide_ccdaf
                LEFT JOIN sri_comprobante d ON a.ide_srcom = d.ide_srcom
                LEFT JOIN sri_estado_comprobante f ON d.ide_sresc = f.ide_sresc
                LEFT JOIN ven_vendedor v ON a.ide_vgven = v.ide_vgven
                LEFT JOIN con_deta_forma_pago x ON a.ide_cndfp1 = x.ide_cndfp
                
                -- LEFT JOIN para incluir todas las facturas, incluso las sin NC
                LEFT JOIN cxp_cabecera_nota nc ON (
                    nc.num_doc_mod_cpcno LIKE '%' || lpad(a.secuencial_cccfa::text, 9, '0') AND
                    nc.ide_cpeno = 1 AND
                    nc.ide_empr = ${dtoIn.ideEmpr}
                )
                
            WHERE
                a.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND a.ide_empr = ${dtoIn.ideEmpr}
                ${condPtoEmision}
                ${condEstadoFact}
                ${condEstadoComp}
                
            GROUP BY
                a.ide_cccfa, a.ide_ccdaf, fecha_emisi_cccfa, establecimiento_ccdfa, 
                pto_emision_ccdfa, secuencial_cccfa, nombre_sresc, nom_geper, 
                identificac_geper, base_grabada_cccfa, base0, valor_iva_cccfa, 
                total_cccfa, claveacceso_srcom, nombre_vgven, nombre_cndfp,
                fecha_trans_cccfa, d.ide_srcom, a.ide_geper, a.ide_cnccc, a.usuario_ingre,
                nc.ide_cpcno
                
            HAVING 
                COUNT(nc.ide_cpcno) > 0  -- Solo facturas con al menos una NC
                
            ORDER BY
                cantidad_notas_credito DESC,
                total_notas_credito DESC,
                secuencial_cccfa DESC
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

    async getFacturasPorCobrar(dtoIn: FacturasDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            WITH facturas_base AS (
                SELECT 
                    cf.ide_cccfa,
                    cf.fecha_emisi_cccfa,
                    cf.secuencial_cccfa,
                    cf.total_cccfa,
                    cf.dias_credito_cccfa,
                    cf.observacion_cccfa,
                    cf.ide_geper,
                    cf.ide_ccdaf,
                    cf.ide_empr,
                    ct.ide_ccctr,
                    ct.fecha_trans_ccctr,
                    ct.observacion_ccctr,
                    ct.usuario_ingre,
                    ct.fecha_ingre,
                    ct.ide_sucu
                FROM cxc_cabece_factura cf
                LEFT JOIN cxc_cabece_transa ct ON cf.ide_cccfa = ct.ide_cccfa
                WHERE 
                    (cf.fecha_emisi_cccfa BETWEEN $1 AND $2 
                     OR ct.fecha_trans_ccctr BETWEEN $3 AND $4)
                    AND ct.ide_sucu = $5
                    AND cf.ide_empr = $6
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
            ),
            transacciones_abono AS (
                SELECT 
                    ct.ide_cccfa,
                    SUM(ABS(dt.valor_ccdtr)) as total_abonado
                FROM cxc_detall_transa dt
                JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
                JOIN cxc_tipo_transacc tt ON dt.ide_ccttr = tt.ide_ccttr
                WHERE dt.ide_ccttr NOT IN (7, 9)
                    AND tt.signo_ccttr < 0  -- Solo transacciones de abono (signo negativo)
                GROUP BY ct.ide_cccfa
            ),
            transacciones_cargo AS (
                SELECT 
                    ct.ide_cccfa,
                    SUM(ABS(dt.valor_ccdtr)) as total_cargado
                FROM cxc_detall_transa dt
                JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
                JOIN cxc_tipo_transacc tt ON dt.ide_ccttr = tt.ide_ccttr
                WHERE dt.ide_ccttr NOT IN (7, 9)
                    AND tt.signo_ccttr > 0  -- Solo transacciones de cargo (signo positivo)
                GROUP BY ct.ide_cccfa
            )
            SELECT 
                fb.ide_ccctr,
                fb.ide_cccfa,
                fb.ide_geper,
                
                -- Fecha (prioriza fecha de factura sobre fecha de transacción)
                CASE 
                    WHEN fb.fecha_emisi_cccfa IS NOT NULL THEN fb.fecha_emisi_cccfa 
                    ELSE fb.fecha_trans_ccctr 
                END AS fecha,
                
                -- Información de facturación
                df.serie_ccdaf,
                df.establecimiento_ccdfa,
                df.pto_emision_ccdfa,
                fb.secuencial_cccfa,
                fb.total_cccfa,
                
                -- Información del cliente
                p.nom_geper,
                p.identificac_geper,
                p.uuid,
                
                -- Saldos y pagos CORREGIDOS
                (fb.total_cccfa - COALESCE(ta.total_abonado, 0)) AS saldo_x_pagar,
                COALESCE(ta.total_abonado, 0) AS abonado,
                ROUND(
                    (COALESCE(ta.total_abonado, 0) / fb.total_cccfa * 100), 
                    2
                ) AS porcentaje_pagado,
                
                -- Información de crédito
                fb.dias_credito_cccfa AS dias_credito,
                TO_CHAR(
                    fb.fecha_emisi_cccfa + fb.dias_credito_cccfa * INTERVAL '1 day',
                    'YYYY-MM-DD'
                ) AS fecha_vence,
                
                -- Cálculo de días de mora
                CASE 
                    WHEN fb.fecha_emisi_cccfa IS NOT NULL THEN
                        GREATEST(0, (CURRENT_DATE - (fb.fecha_emisi_cccfa + fb.dias_credito_cccfa))::integer)
                    ELSE 
                        GREATEST(0, (CURRENT_DATE - fb.fecha_trans_ccctr)::integer)
                END AS dias_mora,
                
                -- Estado de la obligación
                CASE 
                    WHEN fb.fecha_emisi_cccfa IS NOT NULL AND 
                         CURRENT_DATE > (fb.fecha_emisi_cccfa + fb.dias_credito_cccfa) THEN 'VENCIDA'
                    WHEN fb.fecha_emisi_cccfa IS NOT NULL AND 
                         CURRENT_DATE <= (fb.fecha_emisi_cccfa + fb.dias_credito_cccfa) THEN 'POR VENCER'
                    ELSE 'SIN FECHA VENCIMIENTO'
                END AS estado_obligacion,
                
                -- Rango de mora
                CASE 
                    WHEN fb.fecha_emisi_cccfa IS NOT NULL AND 
                         CURRENT_DATE > (fb.fecha_emisi_cccfa + fb.dias_credito_cccfa) THEN
                        CASE 
                            WHEN GREATEST(0, (CURRENT_DATE - (fb.fecha_emisi_cccfa + fb.dias_credito_cccfa))::integer) <= 30 THEN '1-30 DÍAS'
                            WHEN GREATEST(0, (CURRENT_DATE - (fb.fecha_emisi_cccfa + fb.dias_credito_cccfa))::integer) <= 60 THEN '31-60 DÍAS'
                            WHEN GREATEST(0, (CURRENT_DATE - (fb.fecha_emisi_cccfa + fb.dias_credito_cccfa))::integer) <= 90 THEN '61-90 DÍAS'
                            ELSE 'MÁS DE 90 DÍAS'
                        END
                    ELSE 'NO APLICA'
                END AS rango_mora,
                
                -- Observaciones
                COALESCE(fb.observacion_cccfa, fb.observacion_ccctr, '') AS observacion,
                
                -- Información de transacción
                'FACTURA' AS tipo_transaccion,
                1 AS signo_ccttr,
                fb.usuario_ingre,
                fb.fecha_ingre,
                
                -- Información de empresa y sucursal
                fb.ide_empr,
                fb.ide_sucu
        
            FROM facturas_base fb
            LEFT JOIN transacciones_abono ta ON fb.ide_cccfa = ta.ide_cccfa
            LEFT JOIN transacciones_cargo tc ON fb.ide_cccfa = tc.ide_cccfa
            LEFT JOIN cxc_datos_fac df ON fb.ide_ccdaf = df.ide_ccdaf
            LEFT JOIN gen_persona p ON fb.ide_geper = p.ide_geper
            
            WHERE (fb.total_cccfa - COALESCE(ta.total_abonado, 0)) > 0
            
            GROUP BY 
                fb.ide_ccctr,
                fb.ide_cccfa,
                fb.ide_geper,
                df.serie_ccdaf,
                df.establecimiento_ccdfa,
                df.pto_emision_ccdfa,
                fb.secuencial_cccfa,
                fb.total_cccfa,
                p.nom_geper,
                p.identificac_geper,
                p.uuid,
                fb.dias_credito_cccfa,
                fb.fecha_emisi_cccfa,
                fb.fecha_trans_ccctr,
                fb.observacion_cccfa,
                fb.observacion_ccctr,
                fb.usuario_ingre,
                fb.fecha_ingre,
                fb.ide_empr,
                fb.ide_sucu,
                ta.total_abonado,
                tc.total_cargado
                
            ORDER BY 
                estado_obligacion DESC,
                dias_mora DESC,
                fecha ASC,
                fb.ide_ccctr ASC
            `,
            dtoIn
        );

        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.fechaInicio);
        query.addParam(4, dtoIn.fechaFin);
        query.addParam(5, dtoIn.ideSucu);
        query.addParam(6, dtoIn.ideEmpr);
        return await this.dataSource.createQuery(query);
    }



}
