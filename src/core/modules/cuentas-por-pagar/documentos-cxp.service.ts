import { Injectable, BadRequestException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { AnticiposProveedorCxPDto } from './dto/anticipos-proveedor-cxp.dto';
import { GetDocumentosCxPDto } from './dto/get-documentos-cxp.dto';
import { PeriodoCxPDto, PeriodoMesCxPDto } from './dto/periodo-mes-cxp.dto';
import { ProveedoresCxPDto } from './dto/proveedores-cxp.dto';
import { ReporteComprasMensualesDto } from './dto/reporte-compras-mensuales.dto';
import { SaldosProveedoresCxPDto } from './dto/saldos-proveedores-cxp.dto';
import { SustentoTributarioCxPDto } from './dto/sustento-tributario-cxp.dto';

/** Tipo de documento "Importaciones" (valor fijo heredado del legacy) */
const IDE_CNTDO_IMPORTACIONES = 11;
/** Tipo de identificación de proveedores extranjeros (valor fijo heredado del legacy) */
const IDE_GETID_EXTRANJERO = 4;

/**
 * Servicio de consultas para documentos CxP (cxp_cabece_factur)
 */
@Injectable()
export class DocumentosCxPService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxp_estado_factura_normal',
                'p_con_tipo_documento_factura',
                'p_con_tipo_documento_nota_credito',
                'p_con_tipo_documento_reembolso',
                'p_con_tipo_documento_nota_venta',
                'p_con_tipo_documento_liquidacion_compra',
                'p_con_tipo_contribuyente_nota_venta',
                'p_gen_tipo_iden_ruc',
                'p_cxp_tipo_trans_anticipo',
                'p_cxp_estado_factura_anulada',
                'p_cxp_dias_mod_doccxp',
                'p_con_porcentaje_imp_iva',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Retorna el combo de tipos de documento CxP
     */
    async getListDataTiposDocumentoCxP() {
        const factura = this.variables.get('p_con_tipo_documento_factura');
        const notaCredito = this.variables.get('p_con_tipo_documento_nota_credito');
        const reembolso = this.variables.get('p_con_tipo_documento_reembolso');
        const notaVenta = this.variables.get('p_con_tipo_documento_nota_venta');
        const liqCompra = this.variables.get('p_con_tipo_documento_liquidacion_compra');

        const query = new SelectQuery(`
            SELECT CAST(ide_cntdo AS VARCHAR) AS value, nombre_cntdo AS label
            FROM con_tipo_document
            WHERE ide_cntdo IN (${factura}, ${liqCompra}, ${notaVenta}, ${reembolso}, ${notaCredito}, 11)
            ORDER BY nombre_cntdo
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna el listado de documentos CxP en un rango de fechas
     */
    async getDocumentos(dtoIn: GetDocumentosCxPDto & HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
        const condicionTipo = dtoIn.ide_cntdo ? `AND a.ide_cntdo = ${dtoIn.ide_cntdo}` : '';

        const query = new SelectQuery(
            `
            SELECT a.ide_cpcfa,
                   a.fecha_emisi_cpcfa,
                   a.ide_cnccc,
                   f.numero_cncre,
                   e.nombre_cntdo,
                   a.numero_cpcfa,
                   a.ide_cpefa,
                   c.nombre_cpefa,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcfa  AS ventas12,
                   a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS ventas0,
                   a.valor_iva_cpcfa,
                   a.total_cpcfa,
                   a.observacion_cpcfa,
                   a.fecha_trans_cpcfa,
                   a.ide_cncre
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            LEFT JOIN cxp_estado_factur c ON a.ide_cpefa = c.ide_cpefa
            INNER JOIN con_tipo_document e ON a.ide_cntdo = e.ide_cntdo
            LEFT JOIN con_cabece_retenc f ON a.ide_cncre = f.ide_cncre
            WHERE a.fecha_emisi_cpcfa BETWEEN $1 AND $2
              AND a.ide_cpefa = ${estadoNormal}
              AND a.ide_sucu = $3
              AND a.ide_rem_cpcfa IS NULL
              ${condicionTipo}
            ORDER BY a.fecha_emisi_cpcfa DESC, a.numero_cpcfa DESC, a.ide_cpcfa DESC
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Facturas y notas de crédito de compras de un mes/año (Reporte de Compras Mensuales /
     * IVA en Compras). Reutiliza `getComprasMensuales` / `getNotasCreditoMensuales`
     * (mismo par usado por `getDocumentosMensualesPorTipo`, diferenciadas por ide_cntdo ya
     * que a diferencia de ventas, compras no tiene una tabla de notas aparte). El mismo
     * resultado alimenta tanto el endpoint de consulta como el reporte PDF "IVA en Compras".
     */
    async getReporteComprasMensuales(dtoIn: ReporteComprasMensualesDto & HeaderParamsDto) {
        const [facturas, notasCredito] = await Promise.all([
            this.getComprasMensuales(dtoIn),
            this.getNotasCreditoMensuales(dtoIn),
        ]);
        return { facturas, notasCredito };
    }

    /**
     * Retorna el listado de documentos CxP en un rango de fechas con saldo pendiente y
     * estado de pago (Pagado / Parcial / Pendiente), para la página "Documentos por
     * Pagar" (Compras) — paridad de columnas con ventas/facturas.getFacturas.
     */
    async getReporteDocumentos(dtoIn: GetDocumentosCxPDto & HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
        const condicionTipo = dtoIn.ide_cntdo ? `AND a.ide_cntdo = ${dtoIn.ide_cntdo}` : '';

        const query = new SelectQuery(
            `
            WITH documentos_filtrados AS (
                SELECT a.ide_cpcfa, a.ide_cntdo, a.fecha_emisi_cpcfa, a.numero_cpcfa,
                       a.autorizacio_cpcfa, a.ide_geper, a.ide_cnccc, a.ide_cncre, a.pagado_cpcfa,
                       a.base_grabada_cpcfa, a.ide_srcom,
                       a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS base0,
                       a.valor_iva_cpcfa, a.total_cpcfa, a.observacion_cpcfa, a.fecha_trans_cpcfa
                FROM cxp_cabece_factur a
                WHERE a.fecha_emisi_cpcfa BETWEEN $1 AND $2
                  AND a.ide_cpefa = ${estadoNormal}
                  AND a.ide_sucu = $3
                  AND a.ide_rem_cpcfa IS NULL
                  ${condicionTipo}
            ),
            saldos AS (
                SELECT dt.ide_cpcfa, SUM(dt.valor_cpdtr * tt.signo_cpttr) AS saldo
                FROM cxp_detall_transa dt
                INNER JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
                WHERE dt.ide_cpcfa IN (SELECT ide_cpcfa FROM documentos_filtrados)
                GROUP BY dt.ide_cpcfa
            )
            SELECT d.ide_cpcfa,
                   d.ide_cntdo,
                   e.nombre_cntdo,
                   d.fecha_emisi_cpcfa,
                   d.numero_cpcfa,
                   d.autorizacio_cpcfa,
                   p.nom_geper,
                   p.identificac_geper,
                   d.base_grabada_cpcfa AS ventas12,
                   d.base0 AS ventas0,
                   d.valor_iva_cpcfa,
                   d.total_cpcfa,
                   COALESCE(d.total_cpcfa - s.saldo, d.total_cpcfa) AS total_pagado,
                   COALESCE(s.saldo, d.total_cpcfa) AS saldo,
                   CASE
                       WHEN d.pagado_cpcfa THEN 'Pagado'
                       WHEN COALESCE(s.saldo, d.total_cpcfa) >= d.total_cpcfa THEN 'Pendiente'
                       WHEN COALESCE(s.saldo, d.total_cpcfa) <= 0 THEN 'Pagado'
                       ELSE 'Parcial'
                   END AS estado_pago,
                   d.ide_cnccc,
                   d.ide_cncre,
                   f.numero_cncre,
                   d.observacion_cpcfa,
                   d.fecha_trans_cpcfa,
                   sc.claveacceso_srcom,
                   sc.autorizacion_srcomn,
                   sc.ide_sresc,
                   se.nombre_sresc,
                   se.icono_sresc,
                   se.color_sresc
            FROM documentos_filtrados d
            INNER JOIN gen_persona p ON d.ide_geper = p.ide_geper
            INNER JOIN con_tipo_document e ON d.ide_cntdo = e.ide_cntdo
            LEFT JOIN con_cabece_retenc f ON d.ide_cncre = f.ide_cncre
            LEFT JOIN saldos s ON s.ide_cpcfa = d.ide_cpcfa
            LEFT JOIN sri_comprobante sc ON d.ide_srcom = sc.ide_srcom
            LEFT JOIN sri_estado_comprobante se ON sc.ide_sresc = se.ide_sresc
            ORDER BY d.fecha_emisi_cpcfa DESC, d.numero_cpcfa DESC, d.ide_cpcfa DESC
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los documentos CxP anulados en un rango de fechas
     */
    async getDocumentosAnulados(dtoIn: GetDocumentosCxPDto & HeaderParamsDto) {
        const estadoAnulada = this.variables.get('p_cxp_estado_factura_anulada');
        const condicionTipo = dtoIn.ide_cntdo ? `AND a.ide_cntdo = ${dtoIn.ide_cntdo}` : '';

        const query = new SelectQuery(
            `
            SELECT a.ide_cpcfa,
                   a.fecha_emisi_cpcfa,
                   a.ide_cnccc,
                   f.numero_cncre,
                   e.nombre_cntdo,
                   a.numero_cpcfa,
                   a.ide_cpefa,
                   c.nombre_cpefa,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcfa  AS ventas12,
                   a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS ventas0,
                   a.valor_iva_cpcfa,
                   a.total_cpcfa,
                   a.observacion_cpcfa,
                   a.fecha_trans_cpcfa
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            LEFT JOIN cxp_estado_factur c ON a.ide_cpefa = c.ide_cpefa
            INNER JOIN con_tipo_document e ON a.ide_cntdo = e.ide_cntdo
            LEFT JOIN con_cabece_retenc f ON a.ide_cncre = f.ide_cncre
            WHERE a.fecha_emisi_cpcfa BETWEEN $1 AND $2
              AND a.ide_cpefa = ${estadoAnulada}
              AND a.ide_sucu = $3
              AND a.ide_rem_cpcfa IS NULL
              ${condicionTipo}
            ORDER BY a.fecha_emisi_cpcfa DESC, a.numero_cpcfa DESC, a.ide_cpcfa DESC
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los documentos CxP sin asiento contable en un mes/período
     * (para el proceso de generación de asientos de compras)
     */
    async getDocumentosNoContabilizados(dtoIn: PeriodoMesCxPDto & HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
        const condicionTipo = dtoIn.ide_cntdo ? `AND a.ide_cntdo = ${dtoIn.ide_cntdo}` : '';
        const condicionEstado =
            dtoIn.estado === 'CON_ASIENTO'
                ? 'AND a.ide_cnccc IS NOT NULL'
                : dtoIn.estado === 'TODAS'
                    ? ''
                    : 'AND a.ide_cnccc IS NULL';

        const query = new SelectQuery(
            `
            SELECT a.ide_cpcfa,
                   a.fecha_emisi_cpcfa,
                   e.nombre_cntdo,
                   a.numero_cpcfa,
                   a.ide_cpefa,
                   a.ide_cnccc,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcfa  AS ventas12,
                   a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS ventas0,
                   a.valor_iva_cpcfa,
                   a.total_cpcfa,
                   f.numero_cncre,
                   a.observacion_cpcfa,
                   a.fecha_trans_cpcfa
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            INNER JOIN con_tipo_document e ON a.ide_cntdo = e.ide_cntdo
            LEFT JOIN con_cabece_retenc f ON a.ide_cncre = f.ide_cncre
            WHERE EXTRACT(MONTH FROM a.fecha_emisi_cpcfa) = $1
              AND EXTRACT(YEAR FROM a.fecha_emisi_cpcfa) = $2
              AND a.ide_sucu = $3
              AND a.ide_cpefa = ${estadoNormal}
              AND a.ide_rem_cpcfa IS NULL
              ${condicionEstado}
              ${condicionTipo}
            ORDER BY a.fecha_emisi_cpcfa DESC, a.numero_cpcfa DESC, a.ide_cpcfa DESC
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.mes);
        query.addIntParam(2, dtoIn.periodo);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los documentos CxP sin comprobante de retención en un rango
     * de fechas (excluye notas de crédito)
     */
    async getDocumentosNoRetencion(dtoIn: GetDocumentosCxPDto & HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
        const notaCredito = this.variables.get('p_con_tipo_documento_nota_credito');
        const condicionTipo = dtoIn.ide_cntdo ? `AND a.ide_cntdo = ${dtoIn.ide_cntdo}` : '';

        const query = new SelectQuery(
            `
            SELECT a.ide_cpcfa,
                   a.fecha_emisi_cpcfa,
                   a.ide_cnccc,
                   e.nombre_cntdo,
                   a.numero_cpcfa,
                   a.ide_cpefa,
                   c.nombre_cpefa,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcfa  AS ventas12,
                   a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS ventas0,
                   a.valor_iva_cpcfa,
                   a.total_cpcfa,
                   a.observacion_cpcfa,
                   a.fecha_trans_cpcfa
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            LEFT JOIN cxp_estado_factur c ON a.ide_cpefa = c.ide_cpefa
            INNER JOIN con_tipo_document e ON a.ide_cntdo = e.ide_cntdo
            WHERE a.fecha_emisi_cpcfa BETWEEN $1 AND $2
              AND a.ide_sucu = $3
              AND a.ide_rem_cpcfa IS NULL
              AND a.ide_cncre IS NULL
              AND a.ide_cntdo != ${notaCredito}
              AND a.ide_cpefa = ${estadoNormal}
              ${condicionTipo}
            ORDER BY a.fecha_emisi_cpcfa DESC, a.numero_cpcfa DESC, a.ide_cpcfa DESC
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaInicio);
        query.addStringParam(2, dtoIn.fechaFin);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna los documentos del proveedor que aún pueden modificarse:
     * dentro de la ventana de días p_cxp_dias_mod_doccxp (60 por defecto)
     */
    async getDocumentosModificablesProveedor(dtoIn: AnticiposProveedorCxPDto & HeaderParamsDto) {
        const diasModifica = Number(this.variables.get('p_cxp_dias_mod_doccxp')) || 60;

        const query = new SelectQuery(
            `
            SELECT a.ide_cpcfa,
                   a.ide_cntdo,
                   a.fecha_emisi_cpcfa,
                   e.nombre_cntdo,
                   a.numero_cpcfa,
                   a.autorizacio_cpcfa,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcfa  AS ventas12,
                   a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS ventas0,
                   a.valor_iva_cpcfa,
                   a.total_cpcfa,
                   a.observacion_cpcfa,
                   a.fecha_trans_cpcfa,
                   f.numero_cncre,
                   a.ide_cncre
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            INNER JOIN con_tipo_document e ON a.ide_cntdo = e.ide_cntdo
            LEFT JOIN con_cabece_retenc f ON a.ide_cncre = f.ide_cncre
            WHERE a.fecha_emisi_cpcfa BETWEEN CURRENT_DATE - INTERVAL '${diasModifica} days' AND CURRENT_DATE
              AND a.ide_geper = $1
              AND a.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
              AND a.ide_sucu = $2
              AND a.ide_rem_cpcfa IS NULL
            ORDER BY a.fecha_emisi_cpcfa DESC, a.numero_cpcfa DESC, a.ide_cpcfa DESC
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_geper);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Compras (facturas) de un mes: reporte mensual
     */
    async getComprasMensuales(dtoIn: PeriodoMesCxPDto & HeaderParamsDto) {
        const factura = this.variables.get('p_con_tipo_documento_factura');
        return this.getDocumentosMensualesPorTipo(dtoIn, Number(factura));
    }

    /**
     * Notas de crédito de un mes: reporte mensual
     */
    async getNotasCreditoMensuales(dtoIn: PeriodoMesCxPDto & HeaderParamsDto) {
        const notaCredito = this.variables.get('p_con_tipo_documento_nota_credito');
        return this.getDocumentosMensualesPorTipo(dtoIn, Number(notaCredito));
    }

    private async getDocumentosMensualesPorTipo(
        dtoIn: PeriodoMesCxPDto & HeaderParamsDto,
        ideCntdo: number,
    ) {
        const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
        const query = new SelectQuery(`
            SELECT a.ide_cpcfa AS ide,
                   a.fecha_emisi_cpcfa AS fecha,
                   a.numero_cpcfa AS numero,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcfa AS ventas12,
                   a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS ventas0,
                   a.valor_iva_cpcfa AS valor_iva,
                   a.total_cpcfa AS total,
                   a.observacion_cpcfa AS observacion
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            WHERE EXTRACT(MONTH FROM a.fecha_emisi_cpcfa) = $1
              AND EXTRACT(YEAR FROM a.fecha_emisi_cpcfa) = $2
              AND a.ide_sucu = $3
              AND a.ide_cpefa = ${estadoNormal}
              AND a.ide_cntdo = ${ideCntdo}
              AND a.ide_rem_cpcfa IS NULL
            ORDER BY a.numero_cpcfa, a.ide_cpcfa DESC
        `);
        query.addIntParam(1, dtoIn.mes);
        query.addIntParam(2, dtoIn.periodo);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Detalle de compras (por artículo) de un mes
     */
    async getComprasDetalladasMensuales(dtoIn: PeriodoMesCxPDto & HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
        const factura = this.variables.get('p_con_tipo_documento_factura');
        const query = new SelectQuery(
            `
            SELECT c.ide_cpdfa,
                   a.fecha_emisi_cpcfa,
                   a.numero_cpcfa,
                   b.nom_geper,
                   d.nombre_inarti AS producto,
                   c.cantidad_cpdfa,
                   c.precio_cpdfa,
                   c.valor_cpdfa
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            INNER JOIN cxp_detall_factur c ON a.ide_cpcfa = c.ide_cpcfa
            INNER JOIN inv_articulo d ON c.ide_inarti = d.ide_inarti
            WHERE EXTRACT(MONTH FROM a.fecha_emisi_cpcfa) = $1
              AND EXTRACT(YEAR FROM a.fecha_emisi_cpcfa) = $2
              AND a.ide_sucu = $3
              AND a.ide_cpefa = ${estadoNormal}
              AND a.ide_cntdo = ${factura}
            ORDER BY a.fecha_emisi_cpcfa, a.ide_cpcfa, b.nom_geper
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.mes);
        query.addIntParam(2, dtoIn.periodo);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Totales de compras por mes en un período (gráfico de compras)
     */
    async getTotalComprasMensuales(dtoIn: PeriodoCxPDto & HeaderParamsDto) {
        const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
        const query = new SelectQuery(`
            SELECT m.nombre_gemes,
                   COUNT(c.ide_cpcfa)                                             AS num_documentos,
                   COALESCE(SUM(c.base_grabada_cpcfa), 0)                         AS compras12,
                   COALESCE(SUM(c.base_tarifa0_cpcfa + c.base_no_objeto_iva_cpcfa), 0) AS compras0,
                   COALESCE(SUM(c.valor_iva_cpcfa), 0)                            AS iva,
                   COALESCE(SUM(c.total_cpcfa), 0)                                AS total
            FROM gen_mes m
            LEFT JOIN cxp_cabece_factur c
              ON EXTRACT(MONTH FROM c.fecha_emisi_cpcfa) = m.ide_gemes
             AND EXTRACT(YEAR FROM c.fecha_emisi_cpcfa) = $1
             AND c.ide_cpefa = ${estadoNormal}
             AND c.ide_sucu = $2
             AND c.ide_rem_cpcfa IS NULL
            WHERE m.ide_empr = $3
            GROUP BY m.ide_gemes, m.nombre_gemes
            ORDER BY m.ide_gemes
        `);
        query.addIntParam(1, dtoIn.periodo);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addIntParam(3, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Saldos por pagar de todos los proveedores a una fecha de corte
     */
    async getSaldosProveedores(dtoIn: SaldosProveedoresCxPDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT ct.ide_geper,
                   $1 AS fecha_saldo,
                   g.nom_geper AS proveedor,
                   g.identificac_geper AS identificacion,
                   SUM(dt.valor_cpdtr * tt.signo_cpttr) AS valor
            FROM cxp_detall_transa dt
            LEFT JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
            LEFT JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            INNER JOIN gen_persona g ON ct.ide_geper = g.ide_geper
            WHERE dt.fecha_trans_cpdtr <= $2
              AND dt.ide_sucu = $3
            GROUP BY ct.ide_geper, g.nom_geper, g.identificac_geper
            HAVING SUM(dt.valor_cpdtr * tt.signo_cpttr) > 0
            ORDER BY g.nom_geper
            `,
            dtoIn,
        );
        query.addStringParam(1, dtoIn.fechaCorte);
        query.addStringParam(2, dtoIn.fechaCorte);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Combo estático de tipos de IVA del detalle (paridad getListaTipoIVA legacy)
     */
    getListDataTipoIva() {
        return [
            { value: '1', label: 'SI I.V.A.' },
            { value: '-1', label: 'TARIFA 0%' },
            { value: '0', label: 'NO OBJETO DE I.V.A.' },
        ];
    }

    /**
     * Combo de meses (gen_mes)
     */
    async getListDataMeses(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT CAST(ide_gemes AS VARCHAR) AS value, nombre_gemes AS label
            FROM gen_mes
            WHERE ide_empr = $1
            ORDER BY ide_gemes
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Combo de años con documentos CxP registrados
     */
    async getListDataAniosFacturacion(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT DISTINCT CAST(EXTRACT(YEAR FROM fecha_emisi_cpcfa) AS VARCHAR) AS value,
                   CAST(EXTRACT(YEAR FROM fecha_emisi_cpcfa) AS VARCHAR) AS label
            FROM cxp_cabece_factur
            WHERE ide_empr = $1
            ORDER BY 1 DESC
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna un documento CxP completo con su detalle
     */
    async getDocumentoById(ide_cpcfa: number) {
        const cabQuery = new SelectQuery(`
            SELECT a.ide_cpcfa,
                   a.ide_cntdo,
                   a.ide_geper,
                   a.ide_cpefa,
                   a.ide_cndfp,
                   a.ide_cndfp1,
                   a.ide_srtst,
                   a.ide_cncre,
                   a.ide_cnccc,
                   a.ide_rem_cpcfa,
                   a.pagado_cpcfa,
                   a.numero_cpcfa,
                   a.autorizacio_cpcfa,
                   a.fecha_emisi_cpcfa,
                   a.fecha_trans_cpcfa,
                   a.observacion_cpcfa,
                   a.base_grabada_cpcfa,
                   a.base_no_objeto_iva_cpcfa,
                   a.base_tarifa0_cpcfa,
                   a.valor_iva_cpcfa,
                   a.total_cpcfa,
                   a.descuento_cpcfa,
                   a.porcen_desc_cpcfa,
                   a.otros_cpcfa,
                   a.valor_ice_cpcfa,
                   a.tarifa_iva_cpcfa,
                   a.dias_credito_cpcfa,
                   a.ide_cntdo_nc_cpcfa,
                   a.fecha_emision_nc_cpcfa,
                   a.numero_nc_cpcfa,
                   a.autorizacio_nc_cpcfa,
                   a.motivo_nc_cpcfa,
                   p.nom_geper,
                   p.identificac_geper,
                   t.nombre_cntdo,
                   fp.nombre_cndfp AS nombre_forma_pago,
                   dc.nombre_cndfp AS nombre_dias_credito,
                   st.alterno_srtst,
                   st.nombre_srtst,
                   c.nombre_cpefa AS estado_cpcfa,
                   sc.claveacceso_srcom,
                   sc.autorizacion_srcomn,
                   sc.ide_sresc,
                   se.nombre_sresc,
                   se.icono_sresc,
                   se.color_sresc
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona p ON a.ide_geper = p.ide_geper
            INNER JOIN con_tipo_document t ON a.ide_cntdo = t.ide_cntdo
            LEFT JOIN con_deta_forma_pago fp ON a.ide_cndfp = fp.ide_cndfp
            LEFT JOIN con_deta_forma_pago dc ON a.ide_cndfp1 = dc.ide_cndfp
            LEFT JOIN sri_tipo_sustento_tributario st ON a.ide_srtst = st.ide_srtst
            LEFT JOIN cxp_estado_factur c ON a.ide_cpefa = c.ide_cpefa
            LEFT JOIN sri_comprobante sc ON a.ide_srcom = sc.ide_srcom
            LEFT JOIN sri_estado_comprobante se ON sc.ide_sresc = se.ide_sresc
            WHERE a.ide_cpcfa = $1
        `);
        cabQuery.addIntParam(1, ide_cpcfa);
        const cabecera = await this.dataSource.createSingleQuery(cabQuery);
        if (cabecera) {
            // Anulada se resuelve contra la variable de sistema (no un valor fijo) para no
            // desincronizarse si algún ambiente la reconfigura, igual que el resto de queries
            // de este servicio que filtran por p_cxp_estado_factura_anulada.
            cabecera.anulada =
                Number(cabecera.ide_cpefa) === Number(this.variables.get('p_cxp_estado_factura_anulada'));
        }

        const detQuery = new SelectQuery(`
            SELECT d.ide_cpdfa,
                   d.ide_cpcfa,
                   d.ide_inarti,
                   d.ide_inuni,
                   d.cantidad_cpdfa,
                   d.precio_cpdfa,
                   d.valor_cpdfa,
                   d.iva_inarti_cpdfa,
                   d.observacion_cpdfa,
                   d.secuencial_cpdfa,
                   d.alter_tribu_cpdfa,
                   i.nombre_inarti,
                   i.codigo_inarti,
                   u.siglas_inuni
            FROM cxp_detall_factur d
            LEFT JOIN inv_articulo i ON d.ide_inarti = i.ide_inarti
            LEFT JOIN inv_unidad u ON d.ide_inuni = u.ide_inuni
            WHERE d.ide_cpcfa = $1
            ORDER BY d.ide_cpdfa
        `);
        detQuery.addIntParam(1, ide_cpcfa);
        const detalles = await this.dataSource.createSelectQuery(detQuery);

        const remQuery = new SelectQuery(`
            SELECT r.ide_cpcfa,
                   r.ide_cntdo,
                   r.motivo_nc_cpcfa AS identificacion,
                   r.numero_cpcfa,
                   r.fecha_emisi_cpcfa,
                   r.autorizacio_cpcfa,
                   r.base_grabada_cpcfa,
                   r.base_no_objeto_iva_cpcfa,
                   r.base_tarifa0_cpcfa,
                   r.valor_iva_cpcfa,
                   r.valor_ice_cpcfa,
                   r.total_cpcfa
            FROM cxp_cabece_factur r
            WHERE r.ide_rem_cpcfa = $1
            ORDER BY r.ide_cpcfa
        `);
        remQuery.addIntParam(1, ide_cpcfa);
        const reembolsos = await this.dataSource.createSelectQuery(remQuery);

        return { cabecera, detalles, reembolsos };
    }

    /**
     * Lista los pagos realizados a un documento
     */
    async getPagosDocumento(ide_cpcfa: number) {
        const query = new SelectQuery(`
            SELECT a.ide_cpdtr,
                   a.fecha_trans_cpdtr,
                   a.docum_relac_cpdtr,
                   b.nombre_cpttr,
                   a.valor_cpdtr,
                   d.nombre_tecba || ' ' || e.nombre_teban AS destino,
                   a.observacion_cpdtr AS observacion,
                   c.ide_tecba,
                   a.ide_teclb,
                   c.ide_cnccc,
                   ccc.numero_cnccc,
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
                   icb.validado_teincb             AS comprobante_validado,
                   icb.es_efectivo_teincb          AS comprobante_es_efectivo,
                   icb.valor_entregado_teincb      AS comprobante_valor_entregado,
                   icb.cambio_teincb               AS comprobante_cambio
            FROM cxp_detall_transa a
            LEFT JOIN cxp_tipo_transacc b ON a.ide_cpttr = b.ide_cpttr
            LEFT JOIN tes_cab_libr_banc c ON a.ide_teclb = c.ide_teclb
            LEFT JOIN tes_cuenta_banco d ON c.ide_tecba = d.ide_tecba
            LEFT JOIN tes_banco e ON d.ide_teban = e.ide_teban
            LEFT JOIN tes_tip_tran_banc f ON c.ide_tettb = f.ide_tettb
            LEFT JOIN tes_info_comprobante_banco icb ON icb.ide_teclb = a.ide_teclb
            LEFT JOIN con_cab_comp_cont ccc ON ccc.ide_cnccc = c.ide_cnccc
            WHERE a.numero_pago_cpdtr > 0
              AND a.ide_cpcfa = $1
            ORDER BY a.fecha_trans_cpdtr
        `);
        query.addIntParam(1, ide_cpcfa);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Valida si ya existe un documento electronico con esa autorizacion
     */
    async existeDocumentoElectronico(autorizacion: string) {
        const query = new SelectQuery(`
            SELECT numero_cpcfa, autorizacio_cpcfa
            FROM cxp_cabece_factur
            WHERE autorizacio_cpcfa = $1 AND ide_cpefa = 0
            LIMIT 1
        `);
        query.addStringParam(1, autorizacion);
        const result = await this.dataSource.createSingleQuery(query);
        return { existe: !!result };
    }

    /**
     * Retorna las formas de pago con dias de credito para combos
     */
    async getFormasPago() {
        const query = new SelectQuery(`
            SELECT CAST(ide_cndfp AS VARCHAR) AS value, nombre_cndfp AS label, dias_cndfp, alterno_ats
            FROM con_deta_forma_pago
            WHERE ide_cncfp = 3
            ORDER BY nombre_cndfp
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna formas de pago con dias de credito (diferente a contado)
     */
    async getDiasCredito() {
        const query = new SelectQuery(`
            SELECT CAST(ide_cndfp AS VARCHAR) AS value, nombre_cndfp AS label, dias_cndfp
            FROM con_deta_forma_pago
            WHERE ide_cncfp != 3
            ORDER BY dias_cndfp, nombre_cndfp
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Obtiene los dias de credito de una forma de pago
     */
    async getDiasCreditoFormaPago(ide_cndfp: number): Promise<number> {
        const query = new SelectQuery(`
            SELECT dias_cndfp FROM con_deta_forma_pago WHERE ide_cndfp = $1 LIMIT 1
        `);
        query.addIntParam(1, ide_cndfp);
        const result = await this.dataSource.createSingleQuery(query);
        return result?.dias_cndfp ?? 0;
    }

    /**
     * Retorna motivos de nota de credito para combo
     */
    async getMotivosNotaCredito() {
        const query = new SelectQuery(`
            SELECT nombre_cpmno AS value, nombre_cpmno AS label
            FROM cxp_motivo_nota
            ORDER BY nombre_cpmno
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna sustento tributario para combo, filtrado por tipo de documento (Tabla 4 SRI -
     * ATS) cuando se indica ide_cntdo; sin filtro retorna todo el catálogo. La clasificación
     * vive en la tabla sri_sustento_x_documento (editable por SQL directo, sin deploy de
     * backend) en vez de hardcodeada en TypeScript - ver scripts/sri_sustento_x_documento.sql.
     */
    async getSustentoTributario(dtoIn?: SustentoTributarioCxPDto) {
        const filtrarPorTipo = isDefined(dtoIn?.ide_cntdo);
        const query = new SelectQuery(`
            SELECT CAST(a.ide_srtst AS VARCHAR) AS value, a.alterno_srtst || ' - ' || a.nombre_srtst AS label
            FROM sri_tipo_sustento_tributario a
            ${filtrarPorTipo
                ? 'INNER JOIN sri_sustento_x_documento sxd ON sxd.ide_srtst = a.ide_srtst AND sxd.ide_cntdo = $1'
                : ''}
            ORDER BY a.alterno_srtst
        `);
        if (filtrarPorTipo) query.addIntParam(1, Number(dtoIn!.ide_cntdo));
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los proveedores para el combo, filtrados según el tipo de
     * documento (paridad con cargarProveedores del legacy, corregida contra la normativa SRI
     * vigente - ver nota de Nota de Venta abajo):
     *  - Importaciones: solo proveedores extranjeros
     *  - Factura / Nota de Crédito / Reembolso: solo con RUC
     *  - Nota de Venta: solo el Tipo de Contribuyente configurado en el parámetro
     *    `p_con_tipo_contribuyente_nota_venta` (Sistema > Parámetros → con_tipo_contribu) -
     *    normativamente debe apuntar a RIMPE "Negocio Popular" (único régimen habilitado hoy
     *    para emitir nota de venta preimpresa física, Res. NAC-DGERCGC24-00000027 - el legacy
     *    exigía "RISE", régimen derogado desde la reforma de 2022). Parametrizado en vez de
     *    hardcodeado para no depender de que el catálogo del cliente use exactamente ese texto.
     *  - Liquidación de compra: sin RUC (Art. 13 Reglamento de Comprobantes de Venta - aplica a
     *    quien no está inscrito en el RUC al momento de la transacción, no solo cédula)
     */
    async getProveedoresDocumento(dtoIn: ProveedoresCxPDto & HeaderParamsDto) {
        const tipoIdenRuc = this.variables.get('p_gen_tipo_iden_ruc');
        const factura = this.variables.get('p_con_tipo_documento_factura');
        const notaCredito = this.variables.get('p_con_tipo_documento_nota_credito');
        const reembolso = this.variables.get('p_con_tipo_documento_reembolso');
        const notaVenta = this.variables.get('p_con_tipo_documento_nota_venta');
        const liqCompra = this.variables.get('p_con_tipo_documento_liquidacion_compra');

        let condicionTipoIden = '';
        const ideCntdo = dtoIn.ide_cntdo;
        if (isDefined(ideCntdo)) {
            const tipoDoc = String(ideCntdo);
            if (ideCntdo === IDE_CNTDO_IMPORTACIONES) {
                condicionTipoIden = `AND ide_getid = ${IDE_GETID_EXTRANJERO}`;
            } else if ([factura, reembolso, notaCredito].includes(tipoDoc)) {
                condicionTipoIden = `AND ide_getid = ${tipoIdenRuc}`;
            } else if (tipoDoc === liqCompra) {
                condicionTipoIden = `AND ide_getid != ${tipoIdenRuc}`;
            } else if (tipoDoc === notaVenta) {
                const ideCntcoNotaVenta = this.variables.get('p_con_tipo_contribuyente_nota_venta');
                if (!ideCntcoNotaVenta) {
                    throw new BadRequestException(
                        'Falta configurar el parámetro "p_con_tipo_contribuyente_nota_venta" ' +
                        '(Sistema > Parámetros) con el Tipo de Contribuyente habilitado para ' +
                        'emitir Nota de Venta (RIMPE Negocio Popular).',
                    );
                }
                condicionTipoIden = `AND ide_cntco = ${Number(ideCntcoNotaVenta)}`;
            }
        }

        const query = new SelectQuery(`
            SELECT CAST(ide_geper AS VARCHAR) AS value,
                   nom_geper || ' - ' || COALESCE(identificac_geper, '') AS label,
                   identificac_geper
            FROM gen_persona
            WHERE es_proveedo_geper = TRUE
              AND nivel_geper = 'HIJO'
              ${condicionTipoIden}
            ORDER BY nom_geper
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los anticipos del proveedor que aún no están asociados a un
     * documento (cxp_cabece_transa.ide_cpcfa IS NULL)
     */
    async getAnticiposProveedor(dtoIn: AnticiposProveedorCxPDto & HeaderParamsDto) {
        const tipoTransAnticipo = this.variables.get('p_cxp_tipo_trans_anticipo');
        const query = new SelectQuery(`
            SELECT b.ide_cpctr,
                   c.nom_geper,
                   a.valor_cpdtr,
                   a.observacion_cpdtr
            FROM cxp_detall_transa a
            INNER JOIN cxp_cabece_transa b ON a.ide_cpctr = b.ide_cpctr
            INNER JOIN gen_persona c ON b.ide_geper = c.ide_geper
            WHERE a.ide_cpttr = ${tipoTransAnticipo}
              AND b.ide_geper = $1
              AND b.ide_cpcfa IS NULL
              AND a.ide_sucu = $2
        `);
        query.addIntParam(1, dtoIn.ide_geper);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna el siguiente secuencial de liquidación de compra: conserva el
     * prefijo estab-ptoEmi (6 primeros caracteres) de la última liquidación y
     * suma 1 al secuencial con padding a 9 dígitos. Incluye la autorización
     * de la última liquidación registrada (paridad legacy).
     */
    /** Puntos de emisión habilitados para Liquidación de Compra electrónica (mismo mecanismo
     * que getPuntosEmisionRetencion, ide_cntdoc=4 en vez de 8 - ver cxc_datos_fac). El
     * ide_ccdaf elegido aquí es requerido por DocumentosCxPSaveService.saveDocumento para
     * generar secuencial + clave de acceso automáticamente. */
    async getPuntosEmisionLiquidacion(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT CAST(ide_ccdaf AS VARCHAR) AS value,
                   serie_ccdaf || ' ' || COALESCE(autorizacion_ccdaf, '') AS label,
                   observacion_ccdaf
            FROM cxc_datos_fac
            WHERE ide_cntdoc = 4
              AND ide_sucu = $1
        `);
        query.addIntParam(1, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    async getSecuencialLiquidacion(dtoIn: HeaderParamsDto) {
        const liqCompra = this.variables.get('p_con_tipo_documento_liquidacion_compra');
        const query = new SelectQuery(`
            SELECT numero_cpcfa, autorizacio_cpcfa
            FROM cxp_cabece_factur
            WHERE ide_empr = $1
              AND ide_cntdo = $2
            ORDER BY numero_cpcfa DESC
            LIMIT 1
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, Number(liqCompra));
        const ultima = await this.dataSource.createSingleQuery(query);
        if (!ultima?.numero_cpcfa || String(ultima.numero_cpcfa).length <= 6) {
            return { numero_cpcfa: null, autorizacio_cpcfa: null };
        }
        const numLiq = String(ultima.numero_cpcfa);
        const secuencial = (Number.parseInt(numLiq.substring(6), 10) || 0) + 1;
        return {
            numero_cpcfa: numLiq.substring(0, 6) + String(secuencial).padStart(9, '0'),
            autorizacio_cpcfa: ultima.autorizacio_cpcfa,
        };
    }

    /**
     * Obtiene el porcentaje de IVA a una fecha
     */
    /**
     * Tarifa de IVA vigente a una fecha. Paridad legacy exacta
     * (ServicioConfiguracion.getPorcentajeIva del proyecto Java): primero busca en
     * con_porcen_impues la fila cuyo rango [fecha_desde_cnpim, fecha_fin_cnpim] cubra la
     * fecha (activo_cnpim=true); si ninguna cubre esa fecha, cae al ide_cnpim por defecto
     * apuntado por la variable p_con_porcentaje_imp_iva. Antes esto apuntaba a una tabla
     * con_config_iva que nunca existió en el schema migrado — el catch silencioso hacía
     * que TODO documento CxP sin tarifa_iva_cpcfa explícita calculara IVA al 12% fijo,
     * sin importar la fecha (la tarifa real vigente es 15% desde 2024-04-01, ver
     * con_porcen_impues ide_cnpim=3).
     */
    async getPorcentajeIva(fecha: string): Promise<number> {
        try {
            const query = new SelectQuery(`
                SELECT porcentaje_cnpim AS iva
                FROM con_porcen_impues
                WHERE $1::date BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
                  AND activo_cnpim = true
                LIMIT 1
            `);
            query.addStringParam(1, fecha);
            const result = await this.dataSource.createSingleQuery(query);
            if (result?.iva != null) return Number(result.iva);

            const ideCnpimDefault = Number(this.variables.get('p_con_porcentaje_imp_iva'));
            if (ideCnpimDefault) {
                const qDefault = new SelectQuery(`
                    SELECT porcentaje_cnpim AS iva FROM con_porcen_impues WHERE ide_cnpim = $1
                `);
                qDefault.addIntParam(1, ideCnpimDefault);
                const rDefault = await this.dataSource.createSingleQuery(qDefault);
                if (rDefault?.iva != null) return Number(rDefault.iva);
            }
            return 0.15;
        } catch {
            return 0.15;
        }
    }
}
