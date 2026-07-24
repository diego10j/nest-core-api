import { Injectable } from '@nestjs/common';
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
import { SaldosProveedoresCxPDto } from './dto/saldos-proveedores-cxp.dto';

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
                'p_gen_tipo_iden_ruc',
                'p_cxp_tipo_trans_anticipo',
                'p_cxp_estado_factura_anulada',
                'p_cxp_dias_mod_doccxp',
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

        const query = new SelectQuery(
            `
            SELECT a.ide_cpcfa,
                   a.fecha_emisi_cpcfa,
                   e.nombre_cntdo,
                   a.numero_cpcfa,
                   a.ide_cpefa,
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
              AND a.ide_cnccc IS NULL
              AND a.ide_cpefa = ${estadoNormal}
              AND a.ide_rem_cpcfa IS NULL
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
                   a.fecha_emisi_cpcfa,
                   e.nombre_cntdo,
                   a.numero_cpcfa,
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
        const query = new SelectQuery(
            `
            SELECT a.ide_cpcfa,
                   a.fecha_emisi_cpcfa,
                   a.numero_cpcfa,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcfa AS ventas12,
                   a.base_tarifa0_cpcfa + a.base_no_objeto_iva_cpcfa AS ventas0,
                   a.valor_iva_cpcfa,
                   a.total_cpcfa,
                   a.observacion_cpcfa
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            WHERE EXTRACT(MONTH FROM a.fecha_emisi_cpcfa) = $1
              AND EXTRACT(YEAR FROM a.fecha_emisi_cpcfa) = $2
              AND a.ide_sucu = $3
              AND a.ide_cpefa = ${estadoNormal}
              AND a.ide_cntdo = ${ideCntdo}
            ORDER BY a.fecha_emisi_cpcfa, b.nom_geper
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.mes);
        query.addIntParam(2, dtoIn.periodo);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
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
                   t.nombre_cntdo
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona p ON a.ide_geper = p.ide_geper
            INNER JOIN con_tipo_document t ON a.ide_cntdo = t.ide_cntdo
            WHERE a.ide_cpcfa = $1
        `);
        cabQuery.addIntParam(1, ide_cpcfa);
        const cabecera = await this.dataSource.createSingleQuery(cabQuery);

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

        return { cabecera, detalles };
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
                   c.ide_tecba
            FROM cxp_detall_transa a
            LEFT JOIN cxp_tipo_transacc b ON a.ide_cpttr = b.ide_cpttr
            LEFT JOIN tes_cab_libr_banc c ON a.ide_teclb = c.ide_teclb
            LEFT JOIN tes_cuenta_banco d ON c.ide_tecba = d.ide_tecba
            LEFT JOIN tes_banco e ON d.ide_teban = e.ide_teban
            LEFT JOIN tes_tip_tran_banc f ON c.ide_tettb = f.ide_tettb
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
            SELECT CAST(ide_cndfp AS VARCHAR) AS value, nombre_cndfp AS label, dias_cndfp
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
     * Retorna sustento tributario para combo
     */
    async getSustentoTributario() {
        const query = new SelectQuery(`
            SELECT CAST(ide_srtst AS VARCHAR) AS value, alterno_srtst || ' - ' || nombre_srtst AS label
            FROM sri_tipo_sustento_tributario
            ORDER BY alterno_srtst
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los proveedores para el combo, filtrados según el tipo de
     * documento (paridad con cargarProveedores del legacy):
     *  - Importaciones: solo proveedores extranjeros
     *  - Factura / Nota de Venta / Nota de Crédito / Reembolso: solo con RUC
     *  - Liquidación de compra: sin RUC (cédula / pasaporte)
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
            } else if ([factura, reembolso, notaCredito, notaVenta].includes(tipoDoc)) {
                condicionTipoIden = `AND ide_getid = ${tipoIdenRuc}`;
            } else if (tipoDoc === liqCompra) {
                condicionTipoIden = `AND ide_getid != ${tipoIdenRuc}`;
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
    async getPorcentajeIva(fecha: string): Promise<number> {
        try {
            const query = new SelectQuery(`
                SELECT porcentaje_iva_cncii AS iva
                FROM con_config_iva
                WHERE fecha_inicio_cncii <= $1::date
                  AND (fecha_fin_cncii IS NULL OR fecha_fin_cncii >= $1::date)
                ORDER BY fecha_inicio_cncii DESC
                LIMIT 1
            `);
            query.addStringParam(1, fecha);
            const result = await this.dataSource.createSingleQuery(query);
            return result?.iva ?? 0.12;
        } catch {
            return 0.12;
        }
    }
}
