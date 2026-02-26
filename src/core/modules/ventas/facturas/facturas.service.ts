import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { CoreService } from 'src/core/core.service';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { FacturasDto } from './dto/facturas.dto';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { GetFacturaDto } from './dto/get-factura.dto';
import { isDefined } from 'src/util/helpers/common-util';

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
        return this.dataSource.createSelectQuery(query);
    }

    async getFacturasAnuladas(dtoIn: FacturasDto & HeaderParamsDto) {
        dtoIn.ide_sresc = 0;
        return this.getFacturas(dtoIn);
    }

    async getFacturas(dtoIn: FacturasDto & HeaderParamsDto) {
        const condPtoEmision = dtoIn.ide_ccdaf ? `and a.ide_ccdaf =  ${dtoIn.ide_ccdaf}` : '';

        if (isDefined(dtoIn.ide_sresc) && Number(dtoIn.ide_sresc === 0)) {
            // estado anulado
            dtoIn.ide_ccefa = 1;
        }
        else {
            // normal 
            dtoIn.ide_ccefa = Number(this.variables.get('p_cxc_estado_factura_normal'))
        }
        const condEstadoFact = `and a.ide_ccefa =  ${dtoIn.ide_ccefa}`;
        const condEstadoComp = isDefined(dtoIn.ide_sresc) ? `and d.ide_sresc =  ${dtoIn.ide_sresc}` : '';

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
            AND a.ide_sucu = ${dtoIn.ideSucu}
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
        return this.dataSource.createQuery(query);
    }

    async getFacturasConNotasCredito(dtoIn: FacturasDto & HeaderParamsDto) {
        const condPtoEmision = isDefined(dtoIn.ide_ccdaf) ? `and a.ide_ccdaf =  ${dtoIn.ide_ccdaf}` : '';
        const condEstadoFact = isDefined(dtoIn.ide_ccefa)
            ? `and a.ide_ccefa =  ${dtoIn.ide_ccefa}`
            : `and a.ide_ccefa =  ${this.variables.get('p_cxc_estado_factura_normal')} `;
        const condEstadoComp = isDefined(dtoIn.ide_sresc) ? `and a.ide_sresc =  ${dtoIn.ide_sresc}` : '';

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
        return this.dataSource.createQuery(query);
    }

    async getTotalFacturasPorEstado(dtoIn: FacturasDto & HeaderParamsDto) {
        const condPtoEmision = dtoIn.ide_ccdaf ? `and a.ide_ccdaf = ${dtoIn.ide_ccdaf}` : '';
        const ideEstadoNormal = Number(this.variables.get('p_cxc_estado_factura_normal'));

        const query = new SelectQuery(`
        SELECT 
            ide_sresc,
            contador,
            nombre_sresc,
            icono_sresc,
            color_sresc
        FROM (
            -- Un registro por cada estado sri que tenga facturas normales
            SELECT 
                f.ide_sresc,
                COUNT(a.ide_cccfa) AS contador, 
                f.nombre_sresc,             
                f.icono_sresc,
                f.color_sresc,
                f.orden_sresc   
            FROM 
                sri_estado_comprobante f
            LEFT JOIN sri_comprobante d ON d.ide_sresc = f.ide_sresc
            LEFT JOIN cxc_cabece_factura a ON a.ide_srcom = d.ide_srcom
                AND a.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND a.ide_sucu = $3
                AND a.ide_ccefa = ${ideEstadoNormal}
                ${condPtoEmision}
            GROUP BY 
                f.orden_sresc, 
                f.ide_sresc,
                f.icono_sresc,
                f.color_sresc,
                f.nombre_sresc

            UNION ALL

            -- Fila anuladas (ide_ccefa = 1)
            SELECT 
                0 AS ide_sresc,
                COUNT(a.ide_cccfa) AS contador,
                'ANULADAS' AS nombre_sresc,
                'fluent:document-dismiss-24-regular' AS icono_sresc,
                'error' AS color_sresc,
                999 AS orden_sresc
            FROM 
                cxc_cabece_factura a
            WHERE 
                a.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND a.ide_sucu = $3
                AND a.ide_ccefa = 1
                ${condPtoEmision}

            UNION ALL

            -- Fila total general (normales solamente, igual que el detallado por defecto)
            SELECT 
                100 AS ide_sresc,
                COUNT(a.ide_cccfa) AS contador,
                'TODAS' AS nombre_sresc,
                'fluent:document-text-24-regular' AS icono_sresc,  
                'default' AS color_sresc,                 
                -1 AS orden_sresc                        
            FROM 
                cxc_cabece_factura a
            WHERE 
                a.fecha_emisi_cccfa BETWEEN $1 AND $2
                AND a.ide_sucu = $3
                AND a.ide_ccefa = ${ideEstadoNormal}
                ${condPtoEmision}

        ) AS combined
        ORDER BY orden_sresc
    `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
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
        return this.dataSource.createQuery(query);
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
            dtoIn,
        );

        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.fechaInicio);
        query.addParam(4, dtoIn.fechaFin);
        query.addParam(5, dtoIn.ideSucu);
        query.addParam(6, dtoIn.ideEmpr);
        return this.dataSource.createQuery(query);
    }

    async getFacturaById(dtoIn: GetFacturaDto & HeaderParamsDto) {
        // Consulta para obtener la cabecera de la factura con todos los joins
        const queryCabecera = new SelectQuery(
            `
            SELECT
                a.ide_cccfa,
                a.ide_ccdaf,
                a.ide_geper,
                a.ide_vgven,
                a.ide_cndfp1,
                a.ide_cnccc,
                a.ide_cncre,
                a.ide_ccefa,
                a.ide_srcom,
                a.fecha_emisi_cccfa,
                a.secuencial_cccfa,
                a.dias_credito_cccfa,
                a.observacion_cccfa,
                a.base_grabada_cccfa,
                a.base_tarifa0_cccfa,
                a.base_no_objeto_iva_cccfa,
                a.valor_iva_cccfa,
                a.tarifa_iva_cccfa,
                a.total_cccfa,
                a.fecha_trans_cccfa,
                a.usuario_ingre,
                a.fecha_ingre,
                a.hora_ingre,
                
                -- Datos del punto de emisión
                c.serie_ccdaf,
                c.establecimiento_ccdfa,
                c.pto_emision_ccdfa,
                c.observacion_ccdaf,
                
                -- Datos del cliente
                b.nom_geper,
                b.identificac_geper,
                b.direccion_geper,
                b.telefono_geper,
                b.correo_geper,
                b.uuid as uuid_geper,
                
                -- Datos del comprobante electrónico
                d.claveacceso_srcom,
                d.autorizacion_srcomn,
                d.fechaautoriza_srcom,
                d.ide_sresc,
                
                -- Estado del comprobante
                f.nombre_sresc,
                f.icono_sresc,
                f.color_sresc,
                
                -- Datos del vendedor
                v.nombre_vgven,
                v.ide_vgven,
                -- Forma de pago
                x.nombre_cndfp,
  
                
                -- Número de retención si existe
                (
                    SELECT numero_cncre
                    FROM con_cabece_retenc
                    WHERE ide_cncre = a.ide_cncre
                ) as numero_retencion
                
            FROM
                cxc_cabece_factura a
                INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
                INNER JOIN cxc_datos_fac c ON a.ide_ccdaf = c.ide_ccdaf
                LEFT JOIN sri_comprobante d ON a.ide_srcom = d.ide_srcom
                LEFT JOIN sri_estado_comprobante f ON d.ide_sresc = f.ide_sresc
                LEFT JOIN ven_vendedor v ON a.ide_vgven = v.ide_vgven
                LEFT JOIN con_deta_forma_pago x ON a.ide_cndfp1 = x.ide_cndfp
            WHERE
                a.ide_cccfa = $1
                AND a.ide_empr = ${dtoIn.ideEmpr}
            `,
        );
        queryCabecera.addIntParam(1, dtoIn.ide_cccfa);

        // Consulta para obtener los detalles de la factura
        const queryDetalles = new SelectQuery(
            `
            SELECT
                d.ide_ccdfa,
                d.ide_inarti,
                d.cantidad_ccdfa,
                d.precio_ccdfa,
                d.total_ccdfa,
                d.observacion_ccdfa,
                d.iva_inarti_ccdfa,
                
                -- Datos del producto
                p.codigo_inarti,
                p.nombre_inarti,
                p.foto_inarti,
                p.uuid as uuid_inarti,
                p.otro_nombre_inarti,
                p.decim_stock_inarti,
                
                -- Unidad del producto
                u.nombre_inuni,
                u.siglas_inuni,
                
                -- Categoría del producto
                cat.nombre_incate
                
            FROM
                cxc_deta_factura d
                INNER JOIN inv_articulo p ON d.ide_inarti = p.ide_inarti
                LEFT JOIN inv_unidad u ON p.ide_inuni = u.ide_inuni
                LEFT JOIN inv_categoria cat ON p.ide_incate = cat.ide_incate
            WHERE
                d.ide_cccfa = $1
            ORDER BY
                d.ide_ccdfa
            `,
        );
        queryDetalles.addIntParam(1, dtoIn.ide_cccfa);

        // Ejecutar ambas consultas
        const resCabecera = await this.dataSource.createSingleQuery(queryCabecera);
        const resDetalles = await this.dataSource.createSelectQuery(queryDetalles);

        if (!resCabecera) {
            throw new Error(`No se encontró la factura con ide_cccfa: ${dtoIn.ide_cccfa}`);
        }

        // Pagos asociados a la factura
        const queryPagos = new SelectQuery(
            `
            SELECT
            a.ide_ccdtr,
            a.fecha_trans_ccdtr,
            a.docum_relac_ccdtr,
            nombre_tettb,
            a.valor_ccdtr,
            e.nombre_teban,
            d.nombre_tecba as cuenta,
            a.observacion_ccdtr AS observacion,
            c.ide_tecba,
            'PAGO' AS tipo_transaccion,
            a.usuario_ingre,
            a.fecha_ingre,
            a.hora_ingre,
            a.usuario_actua,
            a.fecha_actua,
            a.hora_actua,
            SUM(a.valor_ccdtr) OVER () AS totalpagos
            FROM
            cxc_detall_transa a
            LEFT JOIN cxc_tipo_transacc b ON a.ide_ccttr = b.ide_ccttr
            LEFT JOIN tes_cab_libr_banc c ON a.ide_teclb = c.ide_teclb
            LEFT JOIN tes_cuenta_banco d ON c.ide_tecba = d.ide_tecba
            LEFT JOIN tes_banco e ON d.ide_teban = e.ide_teban
            LEFT JOIN tes_tip_tran_banc f ON c.ide_tettb = f.ide_tettb
            WHERE
            a.numero_pago_ccdtr > 0
            AND a.ide_cccfa = $1
            ORDER BY
            a.fecha_trans_ccdtr
            `,
        );
        queryPagos.addIntParam(1, dtoIn.ide_cccfa);
        const resPagos = await this.dataSource.createSelectQuery(queryPagos);

        const totalPagos = resPagos && resPagos.length > 0 ? parseFloat(resPagos[0].totalpagos) || 0 : 0;

        // retencion asociada a la factura
        const queryRetencion = new SelectQuery(
            `
            SELECT
                a.ide_cncre,
                a.fecha_emisi_cncre,
                a.numero_cncre,
                a.observacion_cncre,
                a.autorizacion_cncre,
                a.correo_cncre,
                a.usuario_ingre,
                a.fecha_ingre,
                a.hora_ingre,
                a.usuario_actua,
                a.fecha_actua,
                a.hora_actua
            FROM
                con_cabece_retenc a
            WHERE
                a.ide_cncre = $1
            `,
        );
        queryRetencion.addParam(1, resCabecera.ide_cncre);

        const queryRetencionDetalles = new SelectQuery(
            `
            SELECT
                a.ide_cndre,
                b.nombre_cncim,
                b.casillero_cncim,
                a.porcentaje_cndre,
                a.base_cndre,
                a.valor_cndre,
                SUM(a.valor_cndre) OVER () AS totalretencion
            FROM
                con_detall_retenc a
                INNER JOIN con_cabece_impues b ON a.ide_cncim = b.ide_cncim
            WHERE
                a.ide_cncre = $1
            `,
        );
        queryRetencionDetalles.addParam(1, resCabecera.ide_cncre);

        const resRetencionCabecera = await this.dataSource.createSingleQuery(queryRetencion);
        const resRetencionDetalles = await this.dataSource.createSelectQuery(queryRetencionDetalles);

        const totalRetencion = resRetencionDetalles && resRetencionDetalles.length > 0
            ? parseFloat(resRetencionDetalles[0].totalretencion) || 0
            : 0;

        // Verifica si la factura se enecuntra pagada en su totalidad
        const totalFactura = parseFloat(resCabecera.total_cccfa) || 0;


        const saldoFinal = totalFactura - totalPagos - totalRetencion;
        const estaPagada = saldoFinal <= 0;
        const colorEstado = estaPagada ? 'success' : 'warning';
        const estadoPago = (() => {
            const totalAplicado = totalPagos + totalRetencion;

            if (totalAplicado === 0) {
                return 'POR PAGAR';
            }

            if (saldoFinal <= 0) {
                return 'PAGADA';
            }

            if (totalAplicado < totalFactura) {
                return 'PAGADO PARCIAL';
            }

            if (totalAplicado > totalFactura) {
                return 'PAGADO EN EXCESO';
            }
        })();

        // guia de remision asociada a la factura
        // guia de remision asociada a la factura
        const queryGuiaRemision = new SelectQuery(
            `
            SELECT
            g.ide_ccgui,
            cdf.establecimiento_ccdfa,
            cdf.pto_emision_ccdfa,
            g.numero_ccgui,
            g.fecha_emision_ccgui,
            g.fecha_ini_trasla_ccgui,
            g.punto_partida_ccgui,
            g.punto_llegada_ccgui,
            g.placa_gecam,
            t.nombre_cctgi,
            c.descripcion_gecam,
            p.nom_geper,
            p.identificac_geper,
            d.claveacceso_srcom,
            d.autorizacion_srcomn,
            d.fechaautoriza_srcom,
            d.ide_sresc,
            e.nombre_sresc
            FROM
            cxc_guia g
            INNER JOIN cxc_tipo_guia t ON g.ide_cctgi = t.ide_cctgi
            INNER JOIN gen_camion c ON g.placa_gecam = c.placa_gecam
            INNER JOIN gen_persona p ON g.gen_ide_geper = p.ide_geper
            INNER JOIN sri_comprobante d ON g.ide_srcom = d.ide_srcom
            INNER JOIN sri_estado_comprobante e ON d.ide_sresc = e.ide_sresc
            INNER JOIN cxc_datos_fac cdf ON g.ide_ccdaf = cdf.ide_ccdaf
            WHERE
            g.ide_cccfa = $1
            `,
        );
        queryGuiaRemision.addIntParam(1, dtoIn.ide_cccfa);
        const resGuiaRemision = await this.dataSource.createSelectQuery(queryGuiaRemision);

        // Retornar 
        return {
            rowCount: 1,
            row: {
                cabecera: resCabecera,
                detalles: resDetalles,
                pagos: {
                    pagada: estaPagada,
                    estado: estadoPago,
                    color: colorEstado,
                    detalles: resPagos,
                    total: totalPagos
                },
                retencion: resRetencionCabecera ? {
                    cabecera: resRetencionCabecera,
                    detalles: resRetencionDetalles,
                    total: totalRetencion
                } : null,
                guiaremision: resGuiaRemision && resGuiaRemision.length > 0 ? resGuiaRemision[0] : null
            },
            message: 'ok',
        };
    }
}

