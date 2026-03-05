import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { CoreService } from 'src/core/core.service';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from '../../../connection/helpers';
import { SriFacturaService } from '../../sri/cel/sri-factura.service';

import { FacturasDto } from './dto/facturas.dto';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { GetFacturaDto } from './dto/get-factura.dto';
import { SaveFacturaDto, DetaFacturaDto } from './dto/save-factura.dto';
import { ResumenDiarioFacturasDto } from './dto/resumen-diario-facturas.dto';
import { isDefined } from 'src/util/helpers/common-util';

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
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Calcula base0, base grabada, IVA y total a partir del array de detalles.
     * Cada detalle indica si aplica IVA con iva_inarti_ccdfa > 0.
     */
    private calcularTotalesFactura(
        detalles: DetaFacturaDto[],
        tarifaIva: number,
    ) {
        let base_tarifa0 = 0;
        let base_grabada = 0;

        for (const det of detalles) {
            if (det.iva_inarti_ccdfa > 0) {
                base_grabada += Number(det.total_ccdfa);
            } else {
                base_tarifa0 += Number(det.total_ccdfa);
            }
        }

        const valor_iva = Number((base_grabada * (tarifaIva / 100)).toFixed(2));
        const total = Number((base_tarifa0 + base_grabada + valor_iva).toFixed(2));

        return {
            base_no_objeto_iva: 0,
            base_tarifa0: Number(base_tarifa0.toFixed(2)),
            base_grabada: Number(base_grabada.toFixed(2)),
            valor_iva,
            total,
        };
    }

    /**
     * Valida las reglas de negocio antes de guardar la factura.
     * Lanza BadRequestException si algo no es válido.
     */
    private async validateSaveFactura(
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): Promise<{ ptoEmision: any; cliente: any }> {
        // 1. Verificar que el punto de emisión existe y pertenece a la empresa
        const qPto = new SelectQuery(`
            SELECT
                a.ide_ccdaf,
                a.establecimiento_ccdfa,
                a.pto_emision_ccdfa,
                a.num_actual_ccdfa,
                a.ide_sucu
            FROM cxc_datos_fac a
            WHERE a.ide_ccdaf = $1
              AND a.ide_empr   = $2
        `);
        qPto.addIntParam(1, dtoIn.ide_ccdaf);
        qPto.addIntParam(2, dtoIn.ideEmpr);
        const ptoEmision = await this.dataSource.createSingleQuery(qPto);

        if (!ptoEmision) {
            throw new BadRequestException(
                `El punto de emisión ide_ccdaf=${dtoIn.ide_ccdaf} no existe o no pertenece a la empresa.`,
            );
        }

        // 2. Verificar que el cliente existe
        const qCliente = new SelectQuery(`
            SELECT
                g.ide_geper,
                g.nom_geper,
                g.identificac_geper,
                g.correo_geper,
                g.direccion_geper,
                t.alterno2_getid AS tipo_identificacion
            FROM gen_persona g
            INNER JOIN gen_tipo_identifi t ON g.ide_getid = t.ide_getid
            WHERE g.ide_geper = $1
        `);
        qCliente.addIntParam(1, dtoIn.ide_geper);
        const cliente = await this.dataSource.createSingleQuery(qCliente);

        if (!cliente) {
            throw new BadRequestException(
                `El cliente ide_geper=${dtoIn.ide_geper} no existe.`,
            );
        }

        // 3. Verificar que el detalle no esté vacío
        if (!dtoIn.detalles || dtoIn.detalles.length === 0) {
            throw new BadRequestException('La factura debe tener al menos un ítem en el detalle.');
        }

        // 4. Verificar que todos los totales de detalle sean positivos
        for (const det of dtoIn.detalles) {
            if (det.cantidad_ccdfa <= 0) {
                throw new BadRequestException(
                    `La cantidad del artículo ide_inarti=${det.ide_inarti} debe ser mayor a 0.`,
                );
            }
            if (det.precio_ccdfa < 0) {
                throw new BadRequestException(
                    `El precio del artículo ide_inarti=${det.ide_inarti} no puede ser negativo.`,
                );
            }
        }

        return { ptoEmision, cliente };
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

    // ─────────────────────────────────────────────────────────────────────────
    // GUARDAR FACTURA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Guarda la cabecera + detalle de una factura y su comprobante SRI
     * dentro de una sola transacción (BEGIN / COMMIT / ROLLBACK).
     *
     * Flujo:
     *  1. Validaciones de negocio
     *  2. Calcular totales desde detalles
     *  3. Obtener secuenciales (sri_comprobante, cxc_cabece_factura, cxc_deta_factura)
     *  4. Construir INSERT sri_comprobante  (SriFacturaService)
     *  5. Construir INSERT cxc_cabece_factura
     *  6. Construir INSERT cxc_deta_factura × N detalles
     *  7. Construir UPDATE cxc_datos_fac  (incrementar num_actual_ccdfa)
     *  8. createListQuery → transacción atómica
     */
    async saveFactura(dtoIn: SaveFacturaDto & HeaderParamsDto) {
        // ── 1. Validaciones ──────────────────────────────────────────────────
        const { ptoEmision, cliente } = await this.validateSaveFactura(dtoIn);

        // ── 2. Configuración de tarifa IVA ───────────────────────────────────
        const tarifaIva = isDefined(dtoIn.tarifa_iva_cccfa)
            ? Number(dtoIn.tarifa_iva_cccfa)
            : 15; // tarifa por defecto Ecuador

        // ── 3. Calcular totales ──────────────────────────────────────────────
        const totales = this.calcularTotalesFactura(dtoIn.detalles, tarifaIva);

        // ── 4. Calcular secuencial  ──────────────────────────────────────────
        const numActual = Number(ptoEmision.num_actual_ccdfa) + 1;
        const secuencial = String(numActual).padStart(9, '0');

        const ideEstadoNormal = Number(this.variables.get('p_cxc_estado_factura_normal'));
        const ideTipoDocFac = Number(this.variables.get('p_con_tipo_documento_factura'));
        const ideSrEscCreado = Number(this.variables.get('p_sri_estado_comprobante_creado'));

        // ── 5. Obtener secuenciales de PK en paralelo ────────────────────────
        const [ideSrcom, ideCccfa, baseIdeCcdfa] = await Promise.all([
            this.sriFacturaService.getSecuencialSriComprobante(dtoIn.login),
            this.dataSource.getSeqTable('cxc_cabece_factura', 'ide_cccfa', 1, dtoIn.login),
            this.dataSource.getSeqTable('cxc_deta_factura', 'ide_ccdfa', dtoIn.detalles.length, dtoIn.login),
        ]);

        // ── 6. INSERT sri_comprobante ────────────────────────────────────────
        const insertSriComp = await this.sriFacturaService.buildSriComprobanteInsert(
            {
                ideEmpr: dtoIn.ideEmpr,
                ideSucu: dtoIn.ideSucu,
                login: dtoIn.login,
                ide_sresc: ideSrEscCreado,
                ide_cntdo: ideTipoDocFac,
                ide_geper: dtoIn.ide_geper,
                fecha_emisi: dtoIn.fecha_emisi_cccfa,
                estab: ptoEmision.establecimiento_ccdfa,
                pto_emi: ptoEmision.pto_emision_ccdfa,
                secuencial,
                subtotal0: totales.base_tarifa0,
                base_grabada: totales.base_grabada,
                iva: totales.valor_iva,
                total: totales.total,
                identificacion: cliente.identificac_geper,
                forma_cobro: dtoIn.ide_cndfp1 ? String(dtoIn.ide_cndfp1) : '01',
                dias_credito: dtoIn.dias_credito_cccfa ?? 0,
                correo: dtoIn.correo_cccfa ?? cliente.correo_geper,
            },
            ideSrcom,
        );

        // ── 7. INSERT cxc_cabece_factura ─────────────────────────────────────
        const insertCabecera = new InsertQuery('cxc_cabece_factura', 'ide_cccfa', dtoIn);
        insertCabecera.values.set('ide_cccfa', ideCccfa);
        insertCabecera.values.set('ide_ccdaf', dtoIn.ide_ccdaf);
        insertCabecera.values.set('ide_geper', dtoIn.ide_geper);
        insertCabecera.values.set('ide_cntdo', ideTipoDocFac);
        insertCabecera.values.set('ide_ccefa', ideEstadoNormal);
        insertCabecera.values.set('ide_srcom', ideSrcom);
        insertCabecera.values.set('fecha_emisi_cccfa', dtoIn.fecha_emisi_cccfa);
        insertCabecera.values.set('secuencial_cccfa', secuencial);
        insertCabecera.values.set('base_no_objeto_iva_cccfa', totales.base_no_objeto_iva);
        insertCabecera.values.set('base_tarifa0_cccfa', totales.base_tarifa0);
        insertCabecera.values.set('base_grabada_cccfa', totales.base_grabada);
        insertCabecera.values.set('valor_iva_cccfa', totales.valor_iva);
        insertCabecera.values.set('tarifa_iva_cccfa', tarifaIva);
        insertCabecera.values.set('total_cccfa', totales.total);
        insertCabecera.values.set('dias_credito_cccfa', dtoIn.dias_credito_cccfa ?? 0);
        insertCabecera.values.set('pagado_cccfa', false);
        insertCabecera.values.set('solo_guardar_cccfa', false);
        if (isDefined(dtoIn.ide_vgven)) insertCabecera.values.set('ide_vgven', dtoIn.ide_vgven);
        if (isDefined(dtoIn.ide_cndfp1)) insertCabecera.values.set('ide_cndfp1', dtoIn.ide_cndfp1);
        if (isDefined(dtoIn.observacion_cccfa)) insertCabecera.values.set('observacion_cccfa', dtoIn.observacion_cccfa);
        if (isDefined(dtoIn.direccion_cccfa)) insertCabecera.values.set('direccion_cccfa', dtoIn.direccion_cccfa);
        if (isDefined(dtoIn.correo_cccfa)) insertCabecera.values.set('correo_cccfa', dtoIn.correo_cccfa);
        if (isDefined(dtoIn.orden_compra_cccfa)) insertCabecera.values.set('orden_compra_cccfa', dtoIn.orden_compra_cccfa);

        // ── 8. INSERT cxc_deta_factura × N ───────────────────────────────────
        const insertDetalles = dtoIn.detalles.map((det, idx) => {
            const q = new InsertQuery('cxc_deta_factura', 'ide_ccdfa', dtoIn);
            q.values.set('ide_ccdfa', baseIdeCcdfa + idx);
            q.values.set('ide_cccfa', ideCccfa);
            q.values.set('ide_inarti', det.ide_inarti);
            q.values.set('cantidad_ccdfa', det.cantidad_ccdfa);
            q.values.set('precio_ccdfa', det.precio_ccdfa);
            q.values.set('total_ccdfa', det.total_ccdfa);
            q.values.set('iva_inarti_ccdfa', det.iva_inarti_ccdfa);
            q.values.set('credito_tributario_ccdfa', det.credito_tributario_ccdfa ?? false);
            if (isDefined(det.observacion_ccdfa)) q.values.set('observacion_ccdfa', det.observacion_ccdfa);
            if (isDefined(det.ide_inuni)) q.values.set('ide_inuni', det.ide_inuni);
            return q;
        });

        // ── 9. UPDATE cxc_datos_fac → incrementar num_actual_ccdfa ──────────
        const updatePto = new UpdateQuery('cxc_datos_fac', 'ide_ccdaf', dtoIn);
        updatePto.values.set('num_actual_ccdfa', numActual);
        updatePto.where = `ide_ccdaf = ${dtoIn.ide_ccdaf}`;

        // ── 10. Ejecutar en transacción atómica ─────────────────────────────
        await this.dataSource.createListQuery([
            insertSriComp,
            insertCabecera,
            ...insertDetalles,
            updatePto,
        ]);

        return {
            rowCount: 1,
            row: {
                ide_cccfa: ideCccfa,
                ide_srcom: ideSrcom,
                secuencial_cccfa: secuencial,
                numero_completo: `${ptoEmision.establecimiento_ccdfa}-${ptoEmision.pto_emision_ccdfa}-${secuencial}`,
                total: totales.total,
            },
            message: 'Factura guardada exitosamente',
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
            INNER JOIN gen_persona b       ON a.ide_geper  = b.ide_geper
            INNER JOIN cxc_datos_fac c     ON a.ide_ccdaf  = c.ide_ccdaf
            LEFT  JOIN sri_comprobante d   ON a.ide_srcom  = d.ide_srcom
            LEFT  JOIN sri_estado_comprobante f ON d.ide_sresc = f.ide_sresc
            LEFT  JOIN ven_vendedor v      ON a.ide_vgven  = v.ide_vgven
            LEFT  JOIN con_deta_forma_pago x ON a.ide_cndfp1 = x.ide_cndfp
            LEFT  JOIN con_cabece_retenc cr  ON a.ide_cncre  = cr.ide_cncre
            LEFT  JOIN pagos_agrupados pa    ON a.ide_cccfa  = pa.ide_cccfa
            LEFT  JOIN retenciones_agrupadas re ON a.ide_cncre = re.ide_cncre
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
            )
            SELECT
                -- Totales generales
                COUNT(b.ide_cccfa)                                                          AS total_facturas,
                COALESCE(SUM(b.total_cccfa), 0)                                             AS total_facturado,
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
            LEFT JOIN pagos       p ON b.ide_cccfa = p.ide_cccfa
            LEFT JOIN retenciones r ON b.ide_cccfa = r.ide_cccfa
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
            SELECT
                b.nom_geper,
                b.identificac_geper,
                b.uuid,
                COUNT(a.ide_cccfa)              AS cantidad_facturas,
                COALESCE(SUM(a.total_cccfa), 0) AS total
            FROM cxc_cabece_factura a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            WHERE a.fecha_emisi_cccfa = $1
              AND a.ide_empr          = $2
              AND a.ide_sucu          = $3
              AND a.ide_ccefa         = ${ideEstadoNormal}
              ${condPto}
            GROUP BY b.nom_geper, b.identificac_geper, b.uuid
            ORDER BY total DESC
            LIMIT 10
        `);
        queryTopClientes.addParam(1, dtoIn.fecha);
        queryTopClientes.addIntParam(2, dtoIn.ideEmpr);
        queryTopClientes.addIntParam(3, dtoIn.ideSucu);

        // ── 6. Top 10 artículos ───────────────────────────────────────────────
        const queryTopArticulos = new SelectQuery(`
            SELECT
                p.codigo_inarti,
                p.nombre_inarti,
                p.uuid                             AS uuid_inarti,
                u.siglas_inuni,
                SUM(d.cantidad_ccdfa)              AS cantidad_vendida,
                COALESCE(SUM(d.total_ccdfa), 0)    AS total
            FROM cxc_deta_factura d
            INNER JOIN cxc_cabece_factura a ON d.ide_cccfa  = a.ide_cccfa
            INNER JOIN inv_articulo       p ON d.ide_inarti = p.ide_inarti
            LEFT  JOIN inv_unidad         u ON p.ide_inuni  = u.ide_inuni
            WHERE a.fecha_emisi_cccfa = $1
              AND a.ide_empr          = $2
              AND a.ide_sucu          = $3
              AND a.ide_ccefa         = ${ideEstadoNormal}
              ${condPto}
            GROUP BY p.codigo_inarti, p.nombre_inarti, p.uuid, u.siglas_inuni
            ORDER BY total DESC
            LIMIT 10
        `);
        queryTopArticulos.addParam(1, dtoIn.fecha);
        queryTopArticulos.addIntParam(2, dtoIn.ideEmpr);
        queryTopArticulos.addIntParam(3, dtoIn.ideSucu);

        // ── 7. Detalle facturas del día con estado de pago ────────────────────
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
            INNER JOIN gen_persona           b ON a.ide_geper  = b.ide_geper
            INNER JOIN cxc_datos_fac         c ON a.ide_ccdaf  = c.ide_ccdaf
            LEFT  JOIN sri_comprobante       d ON a.ide_srcom  = d.ide_srcom
            LEFT  JOIN sri_estado_comprobante f ON d.ide_sresc = f.ide_sresc
            LEFT  JOIN ven_vendedor          v ON a.ide_vgven  = v.ide_vgven
            LEFT  JOIN con_deta_forma_pago   x ON a.ide_cndfp1 = x.ide_cndfp
            LEFT  JOIN pagos_agrupados      pa ON a.ide_cccfa  = pa.ide_cccfa
            LEFT  JOIN retenciones_agrupadas re ON a.ide_cccfa = re.ide_cccfa
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
            facturas,
        ] = await Promise.all([
            this.dataSource.createSingleQuery(queryMetricas),
            this.dataSource.createSelectQuery(queryPorEstadoSri),
            this.dataSource.createSelectQuery(queryPorFormaPago),
            this.dataSource.createSelectQuery(queryPorHora),
            this.dataSource.createSelectQuery(queryTopClientes),
            this.dataSource.createSelectQuery(queryTopArticulos),
            this.dataSource.createSelectQuery(queryDetalle),
        ]);

        return {
            rowCount: 1,
            row: {
                fecha: dtoIn.fecha,
                metricas,
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
}

