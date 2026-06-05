import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers';
import { SriFacturaService } from '../../sri/cel/sri-factura.service';

import { FacturasDto } from './dto/facturas.dto';
import { GetFacturaDto } from './dto/get-factura.dto';
import { GetInitDataDto, GetProductoDetalleDto } from './dto/get-init-data.dto';
import { PagosFacturasDto } from './dto/get-pagos-facturas.dto';
import { UtilidadVentasDto } from './dto/get-util-ventas';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { ResumenDiarioFacturasDto } from './dto/resumen-diario-facturas.dto';

@Injectable()
export class FacturasService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly sriFacturaService: SriFacturaService,
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.core
            .getVariables([
                'p_cxc_estado_factura_normal',    // 0 estado normal de factura
                'p_con_tipo_documento_factura',   // 1 tipo documento factura
                'p_sri_estado_comprobante_creado', // 2 estado SRI al crear comprobante
                'p_inv_estado_normal',             // 3 estado normal de comprobante inventario
                'p_inv_bodega_activa',
                'p_tes_estado_lib_banco_normal'
            ])
            .then((result) => {
                this.variables = result;
            });
    }


    // ─────────────────────────────────────────────────────────────────────────
    // SECUENCIAL
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Obtiene los datos del punto de emisión y retorna el número de secuencia
     * formateado como string de 9 dígitos.
     */
    async getSecuencialFactura(
        dtoIn: { ide_ccdaf: number } & HeaderParamsDto,
    ) {
        const qPto = new SelectQuery(`
            SELECT
                establecimiento_ccdfa,
                pto_emision_ccdfa,
                num_actual_ccdfa
            FROM cxc_datos_fac
            WHERE ide_ccdaf = $1
              AND ide_empr   = $2
        `);
        qPto.addIntParam(1, dtoIn.ide_ccdaf);
        qPto.addIntParam(2, dtoIn.ideEmpr);
        const pto = await this.dataSource.createSingleQuery(qPto);

        if (!pto) {
            throw new BadRequestException(
                `Punto de emisión ide_ccdaf=${dtoIn.ide_ccdaf} no encontrado.`,
            );
        }

        const siguiente = Number(pto.num_actual_ccdfa) + 1;
        const secuencial = String(siguiente).padStart(9, '0');

        return {
            rowCount: 1,
            row: {
                establecimiento: pto.establecimiento_ccdfa,
                pto_emision: pto.pto_emision_ccdfa,
                num_actual: pto.num_actual_ccdfa,
                secuencial,
                serie: `${pto.establecimiento_ccdfa}-${pto.pto_emision_ccdfa}`,
                numero_completo: `${pto.establecimiento_ccdfa}-${pto.pto_emision_ccdfa}-${secuencial}`,
            },
            message: 'ok',
        };
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
        WITH pagos_agrupados AS (
            SELECT
                ide_cccfa,
                SUM(valor_ccdtr) AS total_pagado
            FROM cxc_detall_transa
            WHERE numero_pago_ccdtr > 0
            GROUP BY ide_cccfa
        ),
        retenciones_agrupadas AS (
            SELECT
                cr.ide_cncre,
                SUM(dr.valor_cndre) AS total_retencion
            FROM con_detall_retenc dr
            INNER JOIN con_cabece_retenc cr ON dr.ide_cncre = cr.ide_cncre
            GROUP BY cr.ide_cncre
        ),
        notas_credito_agrupadas AS (
            SELECT
                cf.ide_cccfa,
                SUM(nc.total_cpcno) AS total_nc
            FROM cxc_cabece_factura cf
            INNER JOIN cxp_cabecera_nota nc ON (
                nc.ide_cccfa = cf.ide_cccfa
                AND nc.ide_cpeno = 1
            )
            WHERE cf.fecha_emisi_cccfa BETWEEN $1 AND $2
              AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY cf.ide_cccfa
        )
        SELECT
            a.ide_cccfa,
            a.ide_ccdaf,
            fecha_emisi_cccfa,
            establecimiento_ccdfa,
            pto_emision_ccdfa,
            secuencial_cccfa,
            nombre_sresc AS nombre_ccefa,
            nom_geper,
            identificac_geper,
            base_grabada_cccfa,
            base_tarifa0_cccfa + base_no_objeto_iva_cccfa AS base0,
            valor_iva_cccfa,
            total_cccfa,
            claveacceso_srcom,
            nombre_vgven,
            nombre_cndfp,
            cr.numero_cncre AS secuencial_rete,
            fecha_trans_cccfa,
            a.ide_cncre,
            d.ide_srcom,
            a.ide_geper,
            a.ide_cnccc,
            a.usuario_ingre,

            -- Nota de crédito (NULL si no tiene)
            nca.total_nc AS total_nota_credito,

            -- Totales de pago y retención
            COALESCE(pa.total_pagado, 0)     AS total_pagado,
            COALESCE(re.total_retencion, 0)  AS total_retencion,
            (a.total_cccfa
                - COALESCE(pa.total_pagado, 0)
                - COALESCE(re.total_retencion, 0))   AS saldo,

            -- Estado de pago
            CASE
                WHEN (COALESCE(pa.total_pagado, 0) + COALESCE(re.total_retencion, 0)) = 0
                    THEN 'POR PAGAR'
                WHEN (a.total_cccfa
                        - COALESCE(pa.total_pagado, 0)
                        - COALESCE(re.total_retencion, 0)) <= 0
                    THEN 'PAGADA'
                WHEN (COALESCE(pa.total_pagado, 0) + COALESCE(re.total_retencion, 0))
                        > a.total_cccfa
                    THEN 'PAGADO EN EXCESO'
                ELSE 'PAGADO PARCIAL'
            END AS estado_pago,

            -- Color del estado
            CASE
                WHEN (a.total_cccfa
                        - COALESCE(pa.total_pagado, 0)
                        - COALESCE(re.total_retencion, 0)) <= 0
                    THEN 'success'
                ELSE 'warning'
            END AS color_estado

        FROM
            cxc_cabece_factura a
            INNER JOIN gen_persona b           ON a.ide_geper  = b.ide_geper
            INNER JOIN cxc_datos_fac c         ON a.ide_ccdaf  = c.ide_ccdaf
            LEFT  JOIN sri_comprobante d        ON a.ide_srcom  = d.ide_srcom
            LEFT  JOIN sri_estado_comprobante f ON d.ide_sresc  = f.ide_sresc
            LEFT  JOIN ven_vendedor v           ON a.ide_vgven  = v.ide_vgven
            LEFT  JOIN con_deta_forma_pago x    ON a.ide_cndfp1 = x.ide_cndfp
            LEFT  JOIN con_cabece_retenc cr     ON a.ide_cncre  = cr.ide_cncre
            LEFT  JOIN pagos_agrupados pa       ON a.ide_cccfa  = pa.ide_cccfa
            LEFT  JOIN retenciones_agrupadas re ON a.ide_cncre  = re.ide_cncre
            LEFT  JOIN notas_credito_agrupadas nca ON a.ide_cccfa = nca.ide_cccfa
        WHERE
            fecha_emisi_cccfa BETWEEN $1 AND $2
            AND a.ide_sucu = ${dtoIn.ideSucu}
            ${condPtoEmision}
            ${condEstadoFact}
            ${condEstadoComp}
        ORDER BY
            secuencial_cccfa DESC,
            ide_cccfa DESC
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
                    nc.ide_cccfa = a.ide_cccfa AND
                    nc.ide_cpeno = 1
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

    async getUtilidadVentas(dtoIn: UtilidadVentasDto & HeaderParamsDto) {
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
        uv.fecha_ultima_compra,
        uv.nombre_cndfp,
        uv.dias_cndfp,
        uv.ide_sucu
    FROM f_utilidad_ventas($1,$2,$3,null,$4) uv
        `,
            dtoIn,
        );
        query.addParam(1, dtoIn.ideEmpr);
        query.addParam(2, dtoIn.fechaInicio);
        query.addParam(3, dtoIn.fechaFin);
        query.addParam(4, dtoIn.ide_sucu);
        query.isLazy = false;
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

    async getReportePagosFacturas(dtoIn: PagosFacturasDto & HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_cxc_estado_factura_normal');
        const condPtoEmision = dtoIn.ide_ccdaf ? `AND a.ide_ccdaf = ${dtoIn.ide_ccdaf}` : '';
        // condDiferencias usa los valores ya calculados en los CTEs (no subqueries correlacionadas)
        // saldo = total_cccfa - (total_pagado + total_retencion)

        // conDiferencias muestra solo facturas con saldo pendiente real > 0.
        // Excluye facturas totalmente pagadas (saldo <= 0), incluyendo:
        //   - devoluciones completas por NC (saldo negativo)
        //   - facturas pagadas en efectivo/retención (saldo = 0)
        const condDiferencias = String(dtoIn.conDiferencias) === 'true'
            ? `AND (a.total_cccfa - (COALESCE(pt.total_pagado, 0) + COALESCE(re.total_retencion, 0) + COALESCE(ncc.total_notas_credito, 0))) > 0`
            : '';
        const condIdeUsua = (dtoIn.ideUsuaList && dtoIn.ideUsuaList.length > 0)
            ? `AND a.ide_usua = ANY ($3)`
            : '';
        const query = new SelectQuery(
            `
            WITH facturas_ids AS (
                -- CTE ancla: pre-filtra solo los ide_cccfa del rango/empresa/sucursal/estado.
                -- Los CTEs siguientes se unen a este conjunto reducido en lugar de
                -- escanear las tablas completas.
                SELECT a.ide_cccfa, a.ide_cncre
                FROM cxc_cabece_factura a
                WHERE a.fecha_emisi_cccfa BETWEEN $1 AND $2
                  AND a.ide_empr  = ${dtoIn.ideEmpr}
                  AND a.ide_sucu  = ${dtoIn.ideSucu}
                  AND a.ide_ccefa = ${estadoNormal}
                  ${condPtoEmision}
                  ${condIdeUsua}
            ),
            pagos_totales AS (
                -- Total pagado por factura: SUM limpio sin joins adicionales
                -- (igual que pagos_agrupados en getFacturas) para evitar
                -- que los LEFT JOINs de banco/cuenta dupliquen filas.
                SELECT
                    dt.ide_cccfa,
                    SUM(dt.valor_ccdtr) AS total_pagado
                FROM cxc_detall_transa dt
                INNER JOIN facturas_ids fi ON dt.ide_cccfa = fi.ide_cccfa
                WHERE dt.numero_pago_ccdtr > 0
                GROUP BY dt.ide_cccfa
            ),
            pagos_cxc_detalle AS (
                -- Detalle puro de CXC: solo cxc_detall_transa + tipo de transacción.
                -- Sin joins a tesorería ni bancos para no mezclar orígenes.
                SELECT
                    dt.ide_cccfa,
                    json_agg(
                        json_build_object(
                            'ide_ccdtr',     dt.ide_ccdtr,
                            'fecha',         dt.fecha_trans_ccdtr,
                            'documento',     dt.docum_relac_ccdtr,
                            'tipo',          tt.nombre_ccttr,
                            'valor',         dt.valor_ccdtr,
                            'observacion',   dt.observacion_ccdtr,
                            'usuario_ingre', dt.usuario_ingre,
                            'fecha_ingre',   dt.fecha_ingre,
                            'hora_ingre',    dt.hora_ingre
                        ) ORDER BY dt.fecha_trans_ccdtr
                    ) AS pagos_cxc
                FROM cxc_detall_transa dt
                INNER JOIN facturas_ids fi         ON dt.ide_cccfa = fi.ide_cccfa
                LEFT  JOIN cxc_tipo_transacc tt    ON dt.ide_ccttr = tt.ide_ccttr
                WHERE dt.numero_pago_ccdtr > 0
                GROUP BY dt.ide_cccfa
            ),
            pagos_tesoreria AS (
                -- Detalle de tesorería anclado a cada ide_cccfa:
                -- FROM principal es cxc_detall_transa (igual que pagos_cxc_detalle)
                -- para garantizar que valor_teclb se impute solo a su factura.
                -- Solo registros con cuenta bancaria activa (c.ide_tecba IS NOT NULL).
                SELECT
                    dt.ide_cccfa,
                    COALESCE(SUM(c.valor_teclb), 0) AS total_tesoreria,
                    json_agg(
                        json_build_object(
                            'ide_teclb',          c.ide_teclb,
                            'numero_teclb',       c.numero_teclb,
                            'num_comprobante',    c.num_comprobante_teclb,
                            'fecha',              c.fecha_trans_teclb,
                            'tipo',               f.nombre_tettb,
                            'banco',              e.nombre_teban,
                            'foto_banco',         e.foto_teban,
                            'color_banco',        e.color_teban,
                            'cuenta',             d.nombre_tecba,
                            'valor_tesoreria',    c.valor_teclb,
                            'usuario_ingre',      c.usuario_ingre,
                            'fecha_ingre',        c.fecha_ingre,
                            'hora_ingre',         c.hora_ingre
                        ) ORDER BY c.fecha_trans_teclb
                    ) AS pagos_tesoreria
                FROM cxc_detall_transa dt
                INNER JOIN facturas_ids fi         ON dt.ide_cccfa = fi.ide_cccfa
                INNER JOIN tes_cab_libr_banc c     ON c.ide_teclb  = dt.ide_teclb
                                                   AND c.ide_tecba IS NOT NULL
                LEFT  JOIN tes_cuenta_banco  d     ON c.ide_tecba  = d.ide_tecba
                LEFT  JOIN tes_banco         e     ON d.ide_teban  = e.ide_teban
                LEFT  JOIN tes_tip_tran_banc f     ON c.ide_tettb  = f.ide_tettb
                WHERE dt.numero_pago_ccdtr > 0
                GROUP BY dt.ide_cccfa
            ),
            retenciones_cte AS (
                -- Retenciones ancladas al conjunto reducido; evita full scan de
                -- cxc_cabece_factura y con_detall_retenc para toda la historia.
                SELECT
                    fi.ide_cccfa,
                    SUM(dr.valor_cndre) AS total_retencion
                FROM facturas_ids fi
                INNER JOIN con_detall_retenc dr ON dr.ide_cncre = fi.ide_cncre
                WHERE fi.ide_cncre IS NOT NULL
                GROUP BY fi.ide_cccfa
            ),
            notas_credito_cte AS (
                -- Total de notas de crédito asociadas a cada factura.
                -- Se ancla por ide_cccfa (igual que en el resto del service).
                SELECT
                    cf.ide_cccfa,
                    COUNT(nc.ide_cpcno)              AS cantidad_notas_credito,
                    COALESCE(SUM(nc.total_cpcno), 0) AS total_notas_credito
                FROM cxc_cabece_factura cf
                INNER JOIN facturas_ids fi ON cf.ide_cccfa = fi.ide_cccfa
                INNER JOIN cxp_cabecera_nota nc ON (
                    nc.ide_cccfa = cf.ide_cccfa
                    AND nc.ide_cpeno = 1
                )
                GROUP BY cf.ide_cccfa
            )
            SELECT
                a.ide_cccfa,
                a.ide_geper,
                a.fecha_emisi_cccfa,
                df.establecimiento_ccdfa,
                df.pto_emision_ccdfa,
                df.serie_ccdaf,
                a.secuencial_cccfa,
                b.nom_geper AS cliente,
                b.identificac_geper,
                a.base_grabada_cccfa,
                a.base_tarifa0_cccfa + COALESCE(a.base_no_objeto_iva_cccfa, 0) AS base0,
                a.valor_iva_cccfa,
                a.total_cccfa,
                COALESCE(re.total_retencion, 0) AS total_retencion,
                COALESCE(pt.total_pagado, 0)    AS total_pagado,
                (a.total_cccfa - (COALESCE(pt.total_pagado, 0) + COALESCE(re.total_retencion, 0) + COALESCE(ncc.total_notas_credito, 0))) AS saldo,
                x.nombre_cndfp AS forma_pago,
                a.dias_credito_cccfa,
                CASE
                    WHEN a.dias_credito_cccfa > 0
                        AND (a.fecha_emisi_cccfa + a.dias_credito_cccfa * INTERVAL '1 day') < CURRENT_DATE
                    THEN (a.total_cccfa - (COALESCE(pt.total_pagado, 0) + COALESCE(re.total_retencion, 0) + COALESCE(ncc.total_notas_credito, 0)))
                    ELSE 0
                END AS valor_vencido,
                -- Notas de crédito
                COALESCE(ncc.cantidad_notas_credito, 0)                              AS cantidad_notas_credito,
                COALESCE(ncc.total_notas_credito, 0)                                AS total_notas_credito,
                (a.total_cccfa - COALESCE(ncc.total_notas_credito, 0))              AS total_neto,
                -- Pagos CXC (origen cxc_detall_transa, sin tesorería)
                COALESCE(pcxc.pagos_cxc, '[]'::json)                               AS pagos_cxc,
                -- Pagos Tesorería (origen tes_cab_libr_banc)
                COALESCE(ptes.total_tesoreria, 0)                                   AS total_tesoreria,
                COALESCE(ptes.pagos_tesoreria, '[]'::json)                          AS pagos_tesoreria,
                -- Diferencia: pagos CXC vs registros en tesorería.
                -- La NC no genera movimiento en cxc_detall_transa (total_pagado=0 cuando solo hay NC),
                -- por lo tanto no interviene en esta comparación.
                ROUND(COALESCE(pt.total_pagado, 0) - COALESCE(ptes.total_tesoreria, 0), 2) AS diferencia_tesoreria,
                v.nombre_vgven AS vendedor,
                a.usuario_ingre AS usuario_responsable,
                a.fecha_ingre,
                a.hora_ingre,
                CASE
                    WHEN (COALESCE(pt.total_pagado, 0) + COALESCE(re.total_retencion, 0) + COALESCE(ncc.total_notas_credito, 0)) > a.total_cccfa
                        THEN 'PAGADO EN EXCESO'
                    WHEN (a.total_cccfa - (COALESCE(pt.total_pagado, 0) + COALESCE(re.total_retencion, 0) + COALESCE(ncc.total_notas_credito, 0))) <= 0
                        THEN 'PAGADA'
                    WHEN COALESCE(pt.total_pagado, 0) = 0
                        AND COALESCE(re.total_retencion, 0) = 0
                        AND COALESCE(ncc.total_notas_credito, 0) = 0 THEN 'POR PAGAR'
                    ELSE 'PAGADO PARCIAL'
                END AS estado_pago
            FROM cxc_cabece_factura a
            INNER JOIN facturas_ids fi   ON a.ide_cccfa  = fi.ide_cccfa
            INNER JOIN gen_persona b     ON a.ide_geper  = b.ide_geper
            INNER JOIN cxc_datos_fac df  ON a.ide_ccdaf  = df.ide_ccdaf
            LEFT JOIN con_deta_forma_pago x  ON a.ide_cndfp1 = x.ide_cndfp
            LEFT JOIN ven_vendedor v          ON a.ide_vgven  = v.ide_vgven
            LEFT JOIN pagos_totales pt        ON a.ide_cccfa  = pt.ide_cccfa
            LEFT JOIN pagos_cxc_detalle pcxc  ON a.ide_cccfa  = pcxc.ide_cccfa
            LEFT JOIN pagos_tesoreria ptes    ON a.ide_cccfa  = ptes.ide_cccfa
            LEFT JOIN retenciones_cte re      ON a.ide_cccfa  = re.ide_cccfa
            LEFT JOIN notas_credito_cte ncc   ON a.ide_cccfa  = ncc.ide_cccfa
            WHERE TRUE
                ${condDiferencias}
            ORDER BY a.fecha_emisi_cccfa DESC, a.secuencial_cccfa DESC
            `,
            dtoIn,
        );
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        if (dtoIn.ideUsuaList && dtoIn.ideUsuaList.length > 0) {
            query.addParam(3, dtoIn.ideUsuaList);
        }
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
                a.direccion_cccfa,
                a.orden_compra_cccfa,
                a.correo_cccfa,
                a.num_proforma_cccfa,
                a.usuario_actua,
                a.fecha_actua,
                a.hora_actua,
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
                p.hace_kardex_inarti,
                
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
                cat.nombre_incate,
                d.usuario_ingre,
                d.fecha_ingre,
                d.hora_ingre,              
                d.usuario_actua,
                d.fecha_actua,
                d.hora_actua
                
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

        // Pagos asociados a la factura — valores desde tesorería (tes_cab_libr_banc),
        // anclados por cxc_detall_transa para garantizar imputación correcta por factura.
        // Se mantienen los mismos alias de columna para no romper el front.
        const queryPagos = new SelectQuery(
            `
            SELECT
                dt.ide_ccdtr,
                c.fecha_trans_teclb             AS fecha_trans_ccdtr,
                c.num_comprobante_teclb         AS docum_relac_ccdtr,
                f.nombre_tettb,
                c.valor_teclb                   AS valor_ccdtr,
                e.nombre_teban,
                d.nombre_tecba                  AS cuenta,
                dt.observacion_ccdtr            AS observacion,
                c.ide_tecba,
                'PAGO'                          AS tipo_transaccion,
                c.usuario_ingre,
                c.fecha_ingre,
                c.hora_ingre,
                c.usuario_actua,
                c.fecha_actua,
                c.hora_actua,
                SUM(c.valor_teclb) OVER ()      AS totalpagos,
                e.foto_teban,
                e.color_teban,
                -- Datos del comprobante bancario (OCR/IA)
                icb.foto_teincb                 AS comprobante_foto,
                icb.num_comprobante_teincb      AS comprobante_numero,
                icb.tipo_trns_teincb            AS comprobante_tipo,
                icb.ordenante_teincb            AS comprobante_ordenante,
                icb.cuenta_origen_teincb        AS comprobante_cuenta_origen,
                icb.banco_origen_teincb         AS comprobante_banco_origen,
                icb.beneficiario_teincb         AS comprobante_beneficiario,
                icb.cuenta_destino_teincb       AS comprobante_cuenta_destino,
                icb.banco_destino_teincb        AS comprobante_banco_destino,
                icb.texto_original_teincb       AS comprobante_texto_original,
                icb.por_ocr_teincb              AS comprobante_por_ocr,
                icb.por_ia_teincb               AS comprobante_por_ia,
                icb.validado_teincb             AS comprobante_validado
            FROM cxc_detall_transa dt
            INNER JOIN tes_cab_libr_banc c  ON c.ide_teclb  = dt.ide_teclb
                                           AND c.ide_tecba IS NOT NULL
            LEFT  JOIN tes_cuenta_banco  d  ON c.ide_tecba  = d.ide_tecba
            LEFT  JOIN tes_banco         e  ON d.ide_teban  = e.ide_teban
            LEFT  JOIN tes_tip_tran_banc f  ON c.ide_tettb  = f.ide_tettb
            LEFT  JOIN tes_info_comprobante_banco icb ON icb.ide_teclb = c.ide_teclb
            WHERE dt.numero_pago_ccdtr > 0
              AND dt.ide_cccfa = $1
            ORDER BY c.fecha_trans_teclb
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
            LEFT  JOIN gen_camion c ON g.placa_gecam = c.placa_gecam
            LEFT  JOIN gen_persona p ON g.gen_ide_geper = p.ide_geper
            LEFT  JOIN sri_comprobante d ON g.ide_srcom = d.ide_srcom
            LEFT  JOIN sri_estado_comprobante e ON d.ide_sresc = e.ide_sresc
            INNER JOIN cxc_datos_fac cdf ON g.ide_ccdaf = cdf.ide_ccdaf
            WHERE
            g.ide_cccfa = $1
            `,
        );
        queryGuiaRemision.addIntParam(1, dtoIn.ide_cccfa);
        const resGuiaRemision = await this.dataSource.createSelectQuery(queryGuiaRemision);

        // notas de crédito asociadas a la factura
        const queryNotasCredito = new SelectQuery(
            `
            SELECT
                nc.ide_cpcno,
                nc.numero_cpcno,
                nc.fecha_emisi_cpcno,
                nc.total_cpcno,
                nc.valor_iva_cpcno,
                nc.base_grabada_cpcno,
                nc.base_tarifa0_cpcno,
                nc.base_no_objeto_iva_cpcno,
                nc.observacion_cpcno,
                nc.num_doc_mod_cpcno,
                d.claveacceso_srcom,
                d.autorizacion_srcomn,
                d.fechaautoriza_srcom,
                e.nombre_sresc,
                e.color_sresc,
                e.icono_sresc,
                nc.usuario_ingre,
                nc.fecha_ingre
            FROM cxp_cabecera_nota nc
            LEFT JOIN sri_comprobante d        ON nc.ide_srcom  = d.ide_srcom
            LEFT JOIN sri_estado_comprobante e ON d.ide_sresc   = e.ide_sresc
            WHERE nc.num_doc_mod_cpcno LIKE '%' || lpad($1::text, 9, '0')
              AND nc.ide_cpeno = 1
              AND nc.ide_empr  = d.ide_empr
              AND nc.ide_sucu  = d.ide_sucu
              
            ORDER BY nc.fecha_emisi_cpcno
            `,
        );
        queryNotasCredito.addParam(1, resCabecera.secuencial_cccfa);
        const resNotasCreditoCabecera = await this.dataSource.createSingleQuery(queryNotasCredito);

        const totalNotasCredito = resNotasCreditoCabecera
            ? (resNotasCreditoCabecera?.total_cpcno || 0)
            : 0;

        // detalles de notas de crédito (líneas de productos)
        const queryNotasCreditoDetalles = new SelectQuery(
            `
            SELECT
                det.ide_cpdno,
                det.ide_cpcno,
                det.ide_inarti,
                det.cantidad_cpdno,
                det.precio_cpdno,
                det.valor_cpdno,
                p.codigo_inarti,
                p.nombre_inarti,
                p.uuid        AS uuid_inarti,
                u.siglas_inuni
            FROM cxp_detalle_nota det
            INNER JOIN cxp_cabecera_nota nc ON det.ide_cpcno = nc.ide_cpcno
            INNER JOIN inv_articulo       p  ON det.ide_inarti = p.ide_inarti
            LEFT  JOIN inv_unidad         u  ON p.ide_inuni   = u.ide_inuni
            WHERE nc.num_doc_mod_cpcno LIKE '%' || lpad($1::text, 9, '0')
              AND nc.ide_cpeno = 1
              AND nc.ide_empr  = ${dtoIn.ideEmpr}
            ORDER BY det.ide_cpcno, det.ide_cpdno
            `,
        );
        queryNotasCreditoDetalles.addParam(1, resCabecera.secuencial_cccfa);
        const resNotasCreditoDetalles = await this.dataSource.createSelectQuery(queryNotasCreditoDetalles);

        // comprobante de inventario asociado a la factura
        const queryComprobanteInv = new SelectQuery(
            `
            SELECT
                a.ide_incci,
                a.numero_incci,
                a.fecha_trans_incci,
                b.nombre_inbod,
                c.nombre_intti,
                e.nombre_intci,
                g.nombre_inepi,
                a.verifica_incci,
                a.fec_cam_est_incci,
                a.usuario_verifica_incci,
                a.automatico_incci,
                (
                    SELECT COUNT(1)
                    FROM inv_det_comp_inve det2
                    INNER JOIN inv_articulo art ON det2.ide_inarti = art.ide_inarti
                    WHERE det2.ide_incci = a.ide_incci
                      AND art.hace_kardex_inarti = true
                ) AS total_items,
                a.usuario_ingre,
                a.fecha_ingre
            FROM inv_cab_comp_inve a
            INNER JOIN inv_bodega b ON a.ide_inbod = b.ide_inbod
            INNER JOIN inv_tip_tran_inve c ON a.ide_intti = c.ide_intti
            INNER JOIN inv_tip_comp_inve e ON c.ide_intci = e.ide_intci
            LEFT JOIN inv_est_prev_inve g ON a.ide_inepi = g.ide_inepi
            WHERE EXISTS (
                SELECT 1 FROM inv_det_comp_inve det
                WHERE det.ide_incci = a.ide_incci
                  AND det.ide_cccfa = $1
            )
            LIMIT 1
            `,
        );
        queryComprobanteInv.addIntParam(1, dtoIn.ide_cccfa);
        const resComprobanteInv = await this.dataSource.createSingleQuery(queryComprobanteInv);

        // crea el query de datos empresa
        const queryEmpresa = new SelectQuery(`
            SELECT
            a.ide_empr,
            a.nom_sucu as nom_empr,
            a.correo_sucu as mail_empr,
            a.pagina_sucu as pagina_empr,
            a.identicicacion_sucu as identificacion_empr,
            a.direccion_sucu as direccion_empr,
            a.telefonos_sucu as telefono_empr,
            a.obligadocontabilidad_sucu as obligadocontabilidad_empr,
            a.logotipo_sucu as logotipo_empr,
            a.agente_ret_sucu as agente_ret_empr,
            'REGIMEN GENERAL' AS nombre_cntco
            FROM
            sis_sucursal a
            --LEFT JOIN con_tipo_contribuyente b ON a.ide_cntco = b.ide_cntco
            WHERE
            a.ide_sucu = $1
        `);
        queryEmpresa.addIntParam(1, dtoIn.ideSucu);
        const empresa = await this.dataSource.createSingleQuery(queryEmpresa);


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
                    total: totalPagos,

                },
                retencion: resRetencionCabecera ? {
                    cabecera: resRetencionCabecera,
                    detalles: resRetencionDetalles,
                    total: totalRetencion
                } : null,
                guiaremision: resGuiaRemision && resGuiaRemision.length > 0 ? resGuiaRemision[0] : null,
                notascredito: resNotasCreditoCabecera ? {
                    cabecera: resNotasCreditoCabecera,
                    detalles: resNotasCreditoDetalles,
                    total: totalNotasCredito,
                } : null,
                empresa,
                inventario: resComprobanteInv ?? null,
            },
            message: 'ok',
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESUMEN DIARIO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retorna métricas completas de las facturas emitidas en un día:
     *  - KPIs: total facturado, cobrado, pendiente, ticket promedio, etc.
     *  - Distribución por estado SRI      → gráfico de torta
     *  - Distribución por forma de pago   → gráfico de barras
     *  - Ventas por hora                  → gráfico de línea
     *  - Top 10 clientes                  → gráfico de barras horizontal
     *  - Top 10 artículos vendidos        → gráfico de barras horizontal
     *  - Detalle de facturas del día con estado de pago
     */
    async getResumenDiarioFacturas(dtoIn: ResumenDiarioFacturasDto & HeaderParamsDto) {
        const ideEstadoNormal = Number(this.variables.get('p_cxc_estado_factura_normal'));
        const condPto = isDefined(dtoIn.ide_ccdaf) ? `AND a.ide_ccdaf = ${dtoIn.ide_ccdaf}` : '';
        const condPtoSimple = isDefined(dtoIn.ide_ccdaf) ? `AND ide_ccdaf = ${dtoIn.ide_ccdaf}` : '';

        // ── 1. KPIs / métricas de resumen ─────────────────────────────────────
        const queryMetricas = new SelectQuery(`
            WITH base AS (
                SELECT
                    a.ide_cccfa,
                    a.ide_cncre,
                    a.ide_cndfp1,
                    a.total_cccfa,
                    a.base_grabada_cccfa ,
                    a.base_tarifa0_cccfa ,
                    a.base_no_objeto_iva_cccfa,                    
                    a.valor_iva_cccfa,
                    a.dias_credito_cccfa
                FROM cxc_cabece_factura a
                WHERE a.fecha_emisi_cccfa = $1
                  AND a.ide_empr          = $2
                  AND a.ide_sucu          = $3
                  AND a.ide_ccefa         = ${ideEstadoNormal}
                  ${condPto}
            ),
            pagos AS (
                SELECT dt.ide_cccfa, SUM(dt.valor_ccdtr) AS total_pagado
                FROM cxc_detall_transa dt
                WHERE dt.numero_pago_ccdtr > 0
                  AND dt.ide_cccfa IN (SELECT ide_cccfa FROM base)
                GROUP BY dt.ide_cccfa
            ),
            retenciones AS (
                SELECT cf.ide_cccfa, SUM(dr.valor_cndre) AS total_retencion
                FROM cxc_cabece_factura cf
                INNER JOIN con_detall_retenc dr ON dr.ide_cncre = cf.ide_cncre
                WHERE cf.ide_cccfa IN (SELECT ide_cccfa FROM base)
                  AND cf.ide_cncre IS NOT NULL
                GROUP BY cf.ide_cccfa
            ),
            notas_credito AS (
                SELECT cf.ide_cccfa, COALESCE(SUM(nc.total_cpcno), 0) AS total_nc
                FROM cxc_cabece_factura cf
                INNER JOIN cxp_cabecera_nota nc ON (
                    nc.ide_cccfa = cf.ide_cccfa
                    AND nc.ide_cpeno = 1
                    AND nc.fecha_emisi_cpcno >= cf.fecha_emisi_cccfa
                    AND nc.fecha_emisi_cpcno <= cf.fecha_emisi_cccfa + INTERVAL '30 days'
                )
                WHERE cf.ide_cccfa IN (SELECT ide_cccfa FROM base)
                GROUP BY cf.ide_cccfa
            )
            SELECT
                -- Totales generales
                COUNT(b.ide_cccfa)                                                          AS total_facturas,
                COALESCE(SUM(b.total_cccfa), 0)                                             AS total_facturado,
                COALESCE(SUM(b.base_grabada_cccfa), 0)                                      AS total_base_grabada,
                COALESCE(SUM(b.base_tarifa0_cccfa + b.base_no_objeto_iva_cccfa), 0)         AS total_base0,
                COALESCE(SUM(b.base_grabada_cccfa + b.base_tarifa0_cccfa + b.base_no_objeto_iva_cccfa), 0) AS total_ventas_netas,
                COALESCE(SUM(b.valor_iva_cccfa), 0)                                            AS total_iva,
                CASE WHEN COUNT(b.ide_cccfa) > 0
                     THEN ROUND(SUM(b.total_cccfa) / COUNT(b.ide_cccfa), 2)
                     ELSE 0 END                                                             AS ticket_promedio,

                -- Crédito vs contado (cantidad)
                COUNT(CASE WHEN b.dias_credito_cccfa > 0 THEN 1 END)                       AS facturas_credito,
                COUNT(CASE WHEN b.dias_credito_cccfa = 0 THEN 1 END)                       AS facturas_contado,

                -- Crédito vs contado (montos)
                COALESCE(SUM(CASE WHEN b.dias_credito_cccfa > 0 THEN b.total_cccfa ELSE 0 END), 0) AS total_credito,
                COALESCE(SUM(CASE WHEN b.dias_credito_cccfa = 0 THEN b.total_cccfa ELSE 0 END), 0) AS total_contado,

                -- Cobros y saldos
                COALESCE(SUM(p.total_pagado), 0)                                            AS total_cobrado,
                COALESCE(SUM(r.total_retencion), 0)                                         AS total_retenciones,
                COALESCE(
                    SUM(b.total_cccfa)
                    - SUM(COALESCE(p.total_pagado,    0))
                    - SUM(COALESCE(r.total_retencion, 0)),
                    0
                )                                                                           AS total_pendiente,

                -- Con retención
                COUNT(CASE WHEN b.ide_cncre IS NOT NULL THEN 1 END)                         AS facturas_con_retencion,

                -- Notas de crédito del día
                COUNT(CASE WHEN nc.total_nc > 0 THEN 1 END)                                 AS facturas_con_nota_credito,
                COALESCE(SUM(nc.total_nc), 0)                                               AS monto_notas_credito,
                COALESCE(SUM(b.total_cccfa), 0) - COALESCE(SUM(nc.total_nc), 0)            AS ventas_netas,

                -- Anuladas del mismo día
                (
                    SELECT COUNT(*)
                    FROM cxc_cabece_factura x
                    WHERE x.fecha_emisi_cccfa = $1
                      AND x.ide_empr          = $2
                      AND x.ide_sucu          = $3
                      AND x.ide_ccefa         = 1
                      ${condPtoSimple}
                )                                                                           AS facturas_anuladas

            FROM base b
            LEFT JOIN pagos          p  ON b.ide_cccfa = p.ide_cccfa
            LEFT JOIN retenciones    r  ON b.ide_cccfa = r.ide_cccfa
            LEFT JOIN notas_credito  nc ON b.ide_cccfa = nc.ide_cccfa
        `);
        queryMetricas.addParam(1, dtoIn.fecha);
        queryMetricas.addIntParam(2, dtoIn.ideEmpr);
        queryMetricas.addIntParam(3, dtoIn.ideSucu);

        // ── 2. Distribución por estado SRI ────────────────────────────────────
        const queryPorEstadoSri = new SelectQuery(`
            SELECT
                COALESCE(f.nombre_sresc, 'SIN ENVIAR')   AS nombre,
                COALESCE(f.color_sresc,  'default')      AS color,
                COALESCE(f.icono_sresc,  '')              AS icono,
                COUNT(a.ide_cccfa)                        AS cantidad,
                COALESCE(SUM(a.total_cccfa), 0)           AS total
            FROM cxc_cabece_factura a
            LEFT JOIN sri_comprobante        d ON a.ide_srcom  = d.ide_srcom
            LEFT JOIN sri_estado_comprobante f ON d.ide_sresc  = f.ide_sresc
            WHERE a.fecha_emisi_cccfa = $1
              AND a.ide_empr          = $2
              AND a.ide_sucu          = $3
              AND a.ide_ccefa         = ${ideEstadoNormal}
              ${condPto}
            GROUP BY f.nombre_sresc, f.color_sresc, f.icono_sresc, f.orden_sresc
            ORDER BY f.orden_sresc NULLS LAST
        `);
        queryPorEstadoSri.addParam(1, dtoIn.fecha);
        queryPorEstadoSri.addIntParam(2, dtoIn.ideEmpr);
        queryPorEstadoSri.addIntParam(3, dtoIn.ideSucu);

        // ── 3. Distribución por forma de pago ─────────────────────────────────
        const queryPorFormaPago = new SelectQuery(`
            SELECT
                COALESCE(x.nombre_cndfp, 'SIN ESPECIFICAR') AS nombre,
                COUNT(a.ide_cccfa)                            AS cantidad,
                COALESCE(SUM(a.total_cccfa), 0)               AS total
            FROM cxc_cabece_factura a
            LEFT JOIN con_deta_forma_pago x ON a.ide_cndfp1 = x.ide_cndfp
            WHERE a.fecha_emisi_cccfa = $1
              AND a.ide_empr          = $2
              AND a.ide_sucu          = $3
              AND a.ide_ccefa         = ${ideEstadoNormal}
              ${condPto}
            GROUP BY x.nombre_cndfp
            ORDER BY total DESC
        `);
        queryPorFormaPago.addParam(1, dtoIn.fecha);
        queryPorFormaPago.addIntParam(2, dtoIn.ideEmpr);
        queryPorFormaPago.addIntParam(3, dtoIn.ideSucu);

        // ── 4. Ventas por hora ────────────────────────────────────────────────
        const queryPorHora = new SelectQuery(`
            SELECT
                EXTRACT(HOUR FROM hora_ingre)::int   AS hora,
                TO_CHAR(hora_ingre, 'HH12:MI AM')    AS etiqueta,
                COUNT(ide_cccfa)                      AS cantidad,
                COALESCE(SUM(total_cccfa), 0)         AS total
            FROM cxc_cabece_factura
            WHERE fecha_emisi_cccfa = $1
              AND ide_empr          = $2
              AND ide_sucu          = $3
              AND ide_ccefa         = ${ideEstadoNormal}
              ${condPtoSimple}
            GROUP BY hora, etiqueta
            ORDER BY hora
        `);
        queryPorHora.addParam(1, dtoIn.fecha);
        queryPorHora.addIntParam(2, dtoIn.ideEmpr);
        queryPorHora.addIntParam(3, dtoIn.ideSucu);

        // ── 5. Top 10 clientes ────────────────────────────────────────────────
        const queryTopClientes = new SelectQuery(`
            WITH nc_por_cliente AS (
                SELECT cf.ide_geper, COALESCE(SUM(nc.total_cpcno), 0) AS total_nc
                FROM cxc_cabece_factura cf
                INNER JOIN cxp_cabecera_nota nc ON (
                    nc.ide_cccfa = cf.ide_cccfa
                    AND nc.ide_cpeno = 1
                )
                WHERE cf.fecha_emisi_cccfa = $1
                  AND cf.ide_empr          = $2
                  AND cf.ide_sucu          = $3
                  AND cf.ide_ccefa         = ${ideEstadoNormal}
                  ${condPto}
                GROUP BY cf.ide_geper
            )
            SELECT
                b.nom_geper,
                b.identificac_geper,
                b.uuid,
                COUNT(a.ide_cccfa)                                              AS cantidad_facturas,
                COALESCE(SUM(a.total_cccfa), 0)                                 AS total,
                COALESCE(nc_cli.total_nc, 0)                                    AS total_notas_credito,
                COALESCE(SUM(a.total_cccfa), 0) - COALESCE(nc_cli.total_nc, 0) AS total_neto
            FROM cxc_cabece_factura a
            INNER JOIN gen_persona   b      ON a.ide_geper  = b.ide_geper
            LEFT  JOIN nc_por_cliente nc_cli ON a.ide_geper  = nc_cli.ide_geper
            WHERE a.fecha_emisi_cccfa = $1
              AND a.ide_empr          = $2
              AND a.ide_sucu          = $3
              AND a.ide_ccefa         = ${ideEstadoNormal}
              ${condPto}
            GROUP BY b.nom_geper, b.identificac_geper, b.uuid, nc_cli.total_nc
            ORDER BY total_neto DESC
            LIMIT 10
        `);
        queryTopClientes.addParam(1, dtoIn.fecha);
        queryTopClientes.addIntParam(2, dtoIn.ideEmpr);
        queryTopClientes.addIntParam(3, dtoIn.ideSucu);

        // ── 6. Top 10 artículos ───────────────────────────────────────────────
        const queryTopArticulos = new SelectQuery(`
            WITH nc_por_articulo AS (
                SELECT cdn.ide_inarti, COALESCE(SUM(cdn.valor_cpdno), 0) AS total_nc
                FROM cxc_cabece_factura cf
                INNER JOIN cxp_cabecera_nota  cn  ON (
                    cn.ide_cccfa = cf.ide_cccfa
                    AND cn.ide_cpeno = 1
                )
                INNER JOIN cxp_detalle_nota   cdn ON cn.ide_cpcno = cdn.ide_cpcno
                WHERE cf.fecha_emisi_cccfa = $1
                  AND cf.ide_empr          = $2
                  AND cf.ide_sucu          = $3
                  AND cf.ide_ccefa         = ${ideEstadoNormal}
                  ${condPto}
                GROUP BY cdn.ide_inarti
            )
            SELECT
                p.codigo_inarti,
                p.nombre_inarti,
                p.uuid                                                          AS uuid_inarti,
                u.siglas_inuni,
                SUM(d.cantidad_ccdfa)                                           AS cantidad_vendida,
                COALESCE(SUM(d.total_ccdfa), 0)                                 AS total,
                COALESCE(nc_art.total_nc, 0)                                    AS total_notas_credito,
                COALESCE(SUM(d.total_ccdfa), 0) - COALESCE(nc_art.total_nc, 0) AS total_neto
            FROM cxc_deta_factura d
            INNER JOIN cxc_cabece_factura a   ON d.ide_cccfa  = a.ide_cccfa
            INNER JOIN inv_articulo       p   ON d.ide_inarti = p.ide_inarti
            LEFT  JOIN inv_unidad         u   ON p.ide_inuni  = u.ide_inuni
            LEFT  JOIN nc_por_articulo nc_art ON p.ide_inarti = nc_art.ide_inarti
            WHERE a.fecha_emisi_cccfa = $1
              AND a.ide_empr          = $2
              AND a.ide_sucu          = $3
              AND a.ide_ccefa         = ${ideEstadoNormal}
              AND p.hace_kardex_inarti = true
              ${condPto}
            GROUP BY p.codigo_inarti, p.nombre_inarti, p.uuid, u.siglas_inuni, nc_art.total_nc
            ORDER BY total_neto DESC
            LIMIT 10
        `);
        queryTopArticulos.addParam(1, dtoIn.fecha);
        queryTopArticulos.addIntParam(2, dtoIn.ideEmpr);
        queryTopArticulos.addIntParam(3, dtoIn.ideSucu);

        // ── 7. Utilidad del día ────────────────────────────────────────────────
        // Llama directamente a f_utilidad_ventas con el mismo día como inicio y fin
        const queryUtilidadDia = new SelectQuery(`
            SELECT
                COUNT(*)                                                                                       AS total_items,
                COUNT(*) FILTER (WHERE hace_kardex_inarti = true AND precio_compra = 0)                        AS items_sin_precio_compra,
                COALESCE(SUM(utilidad_neta), 0)                                                                AS total_utilidad
            FROM f_utilidad_ventas($1::BIGINT, $2::DATE, $3::DATE)
             WHERE nota_credito = 0
            AND hace_kardex_inarti = true
        `);
        queryUtilidadDia.addIntParam(1, dtoIn.ideEmpr);
        queryUtilidadDia.addParam(2, dtoIn.fecha);
        queryUtilidadDia.addParam(3, dtoIn.fecha);

        // ── 8. Detalle facturas del día con estado de pago ────────────────────
        const queryDetalle = new SelectQuery(`
            WITH pagos_agrupados AS (
                SELECT ide_cccfa, SUM(valor_ccdtr) AS total_pagado
                FROM cxc_detall_transa
                WHERE numero_pago_ccdtr > 0
                GROUP BY ide_cccfa
            ),
            retenciones_agrupadas AS (
                SELECT cf.ide_cccfa, SUM(dr.valor_cndre) AS total_retencion
                FROM cxc_cabece_factura cf
                INNER JOIN con_detall_retenc dr ON dr.ide_cncre = cf.ide_cncre
                WHERE cf.ide_cncre IS NOT NULL
                GROUP BY cf.ide_cccfa
            ),
            notas_credito_agrupadas AS (
                SELECT
                    cf.ide_cccfa,
                    COUNT(nc.ide_cpcno)                      AS cantidad_nc,
                    COALESCE(SUM(nc.total_cpcno), 0)         AS total_nc,
                    STRING_AGG(nc.numero_cpcno, ', '
                               ORDER BY nc.numero_cpcno)     AS numeros_nc
                FROM cxc_cabece_factura cf
                INNER JOIN cxp_cabecera_nota nc ON (
                    nc.ide_cccfa = cf.ide_cccfa
                    AND nc.ide_cpeno = 1

                )
                WHERE cf.fecha_emisi_cccfa = $1
                  AND cf.ide_empr          = $2
                  AND cf.ide_sucu          = $3
                  AND cf.ide_ccefa         = ${ideEstadoNormal}
                  ${condPto}
                GROUP BY cf.ide_cccfa
            )
            SELECT
                a.ide_cccfa,
                a.ide_ccdaf,
                a.secuencial_cccfa,
                c.establecimiento_ccdfa,
                c.pto_emision_ccdfa,
                b.nom_geper,
                b.identificac_geper,
                b.uuid                                           AS uuid_geper,
                a.total_cccfa,
                a.dias_credito_cccfa,
                a.observacion_cccfa,
                f.nombre_sresc,
                f.color_sresc,
                f.icono_sresc,
                v.nombre_vgven,
                x.nombre_cndfp,
                d.claveacceso_srcom,
                a.hora_ingre,

                COALESCE(pa.total_pagado,    0)                  AS total_pagado,
                COALESCE(re.total_retencion, 0)                  AS total_retencion,
                (a.total_cccfa
                    - COALESCE(pa.total_pagado,    0)
                    - COALESCE(re.total_retencion, 0))           AS saldo,

                -- Notas de crédito de la factura
                COALESCE(nc.cantidad_nc,  0)                     AS cantidad_notas_credito,
                COALESCE(nc.total_nc,     0)                     AS total_notas_credito,
                nc.numeros_nc                                    AS numeros_notas_credito,
                (a.total_cccfa - COALESCE(nc.total_nc, 0))      AS total_neto,

                CASE
                    WHEN (COALESCE(pa.total_pagado, 0) + COALESCE(re.total_retencion, 0)) = 0
                        THEN 'POR PAGAR'
                    WHEN (a.total_cccfa
                            - COALESCE(pa.total_pagado,    0)
                            - COALESCE(re.total_retencion, 0)) <= 0
                        THEN 'PAGADA'
                    WHEN (COALESCE(pa.total_pagado, 0) + COALESCE(re.total_retencion, 0))
                            > a.total_cccfa
                        THEN 'PAGADO EN EXCESO'
                    ELSE 'PAGADO PARCIAL'
                END                                              AS estado_pago,

                CASE
                    WHEN (a.total_cccfa
                            - COALESCE(pa.total_pagado,    0)
                            - COALESCE(re.total_retencion, 0)) <= 0
                        THEN 'success'
                    ELSE 'warning'
                END                                              AS color_estado

            FROM cxc_cabece_factura a
            INNER JOIN gen_persona              b  ON a.ide_geper  = b.ide_geper
            INNER JOIN cxc_datos_fac            c  ON a.ide_ccdaf  = c.ide_ccdaf
            LEFT  JOIN sri_comprobante          d  ON a.ide_srcom  = d.ide_srcom
            LEFT  JOIN sri_estado_comprobante   f  ON d.ide_sresc  = f.ide_sresc
            LEFT  JOIN ven_vendedor             v  ON a.ide_vgven  = v.ide_vgven
            LEFT  JOIN con_deta_forma_pago      x  ON a.ide_cndfp1 = x.ide_cndfp
            LEFT  JOIN pagos_agrupados         pa  ON a.ide_cccfa  = pa.ide_cccfa
            LEFT  JOIN retenciones_agrupadas   re  ON a.ide_cccfa  = re.ide_cccfa
            LEFT  JOIN notas_credito_agrupadas nc  ON a.ide_cccfa  = nc.ide_cccfa
            WHERE a.fecha_emisi_cccfa = $1
              AND a.ide_empr          = $2
              AND a.ide_sucu          = $3
              AND a.ide_ccefa         = ${ideEstadoNormal}
              ${condPto}
            ORDER BY a.hora_ingre, a.ide_cccfa
        `);
        queryDetalle.addParam(1, dtoIn.fecha);
        queryDetalle.addIntParam(2, dtoIn.ideEmpr);
        queryDetalle.addIntParam(3, dtoIn.ideSucu);

        // ── Ejecutar todo en paralelo ─────────────────────────────────────────
        const [
            metricas,
            porEstadoSri,
            porFormaPago,
            porHora,
            topClientes,
            topArticulos,
            utilidadDia,
            facturas,
        ] = await Promise.all([
            this.dataSource.createSingleQuery(queryMetricas),
            this.dataSource.createSelectQuery(queryPorEstadoSri),
            this.dataSource.createSelectQuery(queryPorFormaPago),
            this.dataSource.createSelectQuery(queryPorHora),
            this.dataSource.createSelectQuery(queryTopClientes),
            this.dataSource.createSelectQuery(queryTopArticulos),
            this.dataSource.createSingleQuery(queryUtilidadDia),
            this.dataSource.createSelectQuery(queryDetalle),
        ]);

        return {
            rowCount: 1,
            row: {
                fecha: dtoIn.fecha,
                metricas,
                utilidad: utilidadDia,
                graficas: {
                    por_estado_sri: porEstadoSri,
                    por_forma_pago: porFormaPago,
                    por_hora: porHora,
                    top_clientes: topClientes,
                    top_articulos: topArticulos,
                },
                facturas,
            },
            message: 'ok',
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DATOS INICIALES PARA FORMULARIO DE FACTURA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retorna en una sola llamada todo lo necesario para abrir el formulario
     * de nueva factura: datos del punto de emisión con el siguiente secuencial,
     * tarifa IVA vigente y formas de pago activas de la empresa.
     */
    async getFormularioNuevaFactura(dtoIn: GetInitDataDto & HeaderParamsDto) {
        const qPto = new SelectQuery(`
            SELECT
                ide_ccdaf,
                establecimiento_ccdfa,
                pto_emision_ccdfa,
                serie_ccdaf,
                num_actual_ccdfa,
                ide_sucu
            FROM cxc_datos_fac
            WHERE ide_ccdaf = $1
              AND ide_empr   = $2
        `);
        qPto.addIntParam(1, dtoIn.ide_ccdaf);
        qPto.addIntParam(2, dtoIn.ideEmpr);

        const qFormasPago = new SelectQuery(`
            SELECT
                a.ide_cndfp  AS value,
                a.nombre_cndfp AS label,
                a.dias_cndfp,
                COALESCE(b.icono_cncfp, a.icono_cndfp) AS icono
            FROM con_deta_forma_pago a
            INNER JOIN con_cabece_forma_pago b ON a.ide_cncfp = b.ide_cncfp
            WHERE a.activo_cndfp = TRUE
              AND b.activo_cncfp = TRUE
              AND b.ide_empr     = $1
            ORDER BY b.nombre_cncfp, a.nombre_cndfp
        `);
        qFormasPago.addIntParam(1, dtoIn.ideEmpr);

        const [pto, formasPago] = await Promise.all([
            this.dataSource.createSingleQuery(qPto),
            this.dataSource.createSelectQuery(qFormasPago),
        ]);

        if (!pto) {
            throw new BadRequestException(
                `Punto de emisión ide_ccdaf=${dtoIn.ide_ccdaf} no encontrado.`,
            );
        }

        const siguiente = Number(pto.num_actual_ccdfa) + 1;
        const secuencial = String(siguiente).padStart(9, '0');

        return {
            rowCount: 1,
            row: {
                punto_emision: {
                    ide_ccdaf: pto.ide_ccdaf,
                    establecimiento: pto.establecimiento_ccdfa,
                    pto_emision: pto.pto_emision_ccdfa,
                    serie: pto.serie_ccdaf,
                    num_actual: pto.num_actual_ccdfa,
                    secuencial,
                    numero_completo: `${pto.establecimiento_ccdfa}-${pto.pto_emision_ccdfa}-${secuencial}`,
                },
                tarifa_iva: 15,
                formas_pago: formasPago,
            },
            message: 'ok',
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DATOS DE PRODUCTO PARA LÍNEA DE DETALLE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retorna la información de un artículo al seleccionarlo en el detalle
     * de la factura: datos básicos, stock en bodega activa y, si se envía
     * ide_geper, el último precio de venta facturado a ese cliente.
     */
    async getProductoParaDetalle(dtoIn: GetProductoDetalleDto & HeaderParamsDto) {
        const ideEstNormal = Number(this.variables.get('p_inv_estado_normal'));
        const ideBodega = Number(this.variables.get('p_inv_bodega_activa'));

        const qArticulo = new SelectQuery(`
            SELECT
                a.ide_inarti,
                a.codigo_inarti,
                a.nombre_inarti,
                a.iva_inarti,
                a.hace_kardex_inarti,
                a.decim_stock_inarti,
                a.activo_inarti,
                u.ide_inuni,
                u.siglas_inuni,
                u.nombre_inuni
            FROM inv_articulo a
            LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
            WHERE a.ide_inarti = $1
        `);
        qArticulo.addIntParam(1, dtoIn.ide_inarti);

        const qSaldo = new SelectQuery(`
            SELECT
                f_decimales(
                    SUM(d.cantidad_indci * t.signo_intci),
                    a.decim_stock_inarti
                )::numeric AS saldo
            FROM inv_det_comp_inve d
            INNER JOIN inv_cab_comp_inve  c ON d.ide_incci  = c.ide_incci
            INNER JOIN inv_tip_tran_inve  t ON c.ide_intti  = t.ide_intti
            INNER JOIN inv_articulo       a ON d.ide_inarti = a.ide_inarti
            WHERE d.ide_inarti = $1
              AND c.ide_inbod   = $2
              AND c.ide_inepi   = $3
              AND c.ide_empr    = $4
        `);
        qSaldo.addIntParam(1, dtoIn.ide_inarti);
        qSaldo.addIntParam(2, ideBodega);
        qSaldo.addIntParam(3, ideEstNormal);
        qSaldo.addIntParam(4, dtoIn.ideEmpr);

        const qUltimoPrecio = dtoIn.ide_geper
            ? new SelectQuery(`
                SELECT d.precio_ccdfa AS ultimo_precio
                FROM cxc_deta_factura   d
                INNER JOIN cxc_cabece_factura b ON d.ide_cccfa = b.ide_cccfa
                WHERE b.ide_geper  = $1
                  AND d.ide_inarti = $2
                  AND b.ide_empr   = $3
                  AND b.ide_ccefa  = ${Number(this.variables.get('p_cxc_estado_factura_normal'))}
                ORDER BY b.fecha_emisi_cccfa DESC, b.ide_cccfa DESC
                LIMIT 1
            `)
            : null;

        if (qUltimoPrecio) {
            qUltimoPrecio.addIntParam(1, dtoIn.ide_geper!);
            qUltimoPrecio.addIntParam(2, dtoIn.ide_inarti);
            qUltimoPrecio.addIntParam(3, dtoIn.ideEmpr);
        }

        const [articulo, saldoRow, ultimoPrecioRow] = await Promise.all([
            this.dataSource.createSingleQuery(qArticulo),
            this.dataSource.createSingleQuery(qSaldo),
            qUltimoPrecio
                ? this.dataSource.createSingleQuery(qUltimoPrecio)
                : Promise.resolve<null>(null),
        ]);

        if (!articulo) {
            throw new BadRequestException(
                `Artículo ide_inarti=${dtoIn.ide_inarti} no encontrado.`,
            );
        }

        return {
            rowCount: 1,
            row: {
                ...articulo,
                saldo_bodega: saldoRow?.saldo ?? 0,
                ultimo_precio: ultimoPrecioRow?.ultimo_precio ?? null,
            },
            message: 'ok',
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CATÁLOGOS PARA FORMULARIO DE GUÍA DE REMISIÓN
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Catálogos necesarios para el formulario de guía de remisión:
     * tipos de guía, camiones y formas de pago activas.
     * Se ejecutan en paralelo para minimizar el tiempo de respuesta.
     */
    async getCatalogos(dtoIn: HeaderParamsDto) {
        const qTiposGuia = new SelectQuery(`
            SELECT
                ide_cctgi AS value,
                nombre_cctgi AS label
            FROM cxc_tipo_guia
            ORDER BY nombre_cctgi
        `);

        const qCamiones = new SelectQuery(`
            SELECT
                placa_gecam    AS value,
                placa_gecam    AS placa,
                descripcion_gecam AS label
            FROM gen_camion
            WHERE ide_empr = $1
            ORDER BY descripcion_gecam
        `);
        qCamiones.addIntParam(1, dtoIn.ideEmpr);

        const qFormasPago = new SelectQuery(`
            SELECT
                a.ide_cndfp    AS value,
                a.nombre_cndfp AS label,
                a.dias_cndfp,
                COALESCE(b.icono_cncfp, a.icono_cndfp) AS icono
            FROM con_deta_forma_pago a
            INNER JOIN con_cabece_forma_pago b ON a.ide_cncfp = b.ide_cncfp
            WHERE a.activo_cndfp = TRUE
              AND b.activo_cncfp = TRUE
              AND b.ide_empr     = $1
            ORDER BY b.nombre_cncfp, a.nombre_cndfp
        `);
        qFormasPago.addIntParam(1, dtoIn.ideEmpr);

        const qVendedores = new SelectQuery(`
            SELECT ide_vgven AS value, nombre_vgven AS label
FROM ven_vendedor
WHERE activo_vgven = TRUE AND ide_empr = $1
ORDER BY nombre_vgven
        `);
        qVendedores.addIntParam(1, dtoIn.ideEmpr);

        const [tiposGuia, camiones, formasPago, vendedores] = await Promise.all([
            this.dataSource.createSelectQuery(qTiposGuia),
            this.dataSource.createSelectQuery(qCamiones),
            this.dataSource.createSelectQuery(qFormasPago),
            this.dataSource.createSelectQuery(qVendedores),
        ]);

        return {
            rowCount: 1,
            row: {
                tipos_guia: tiposGuia,
                camiones,
                formas_pago: formasPago,
                vendedores,
            },
            message: 'ok',
        };
    }
}

