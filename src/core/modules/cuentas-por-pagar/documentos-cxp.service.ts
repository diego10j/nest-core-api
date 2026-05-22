import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetDocumentosCxPDto } from './dto/get-documentos-cxp.dto';

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
     * Retorna un documento CxP completo con su detalle
     */
    async getDocumentoById(ide_cpcfa: number) {
        const cabQuery = new SelectQuery(`
            SELECT * FROM cxp_cabece_factur WHERE ide_cpcfa = $1
        `);
        cabQuery.addIntParam(1, ide_cpcfa);
        const cabecera = await this.dataSource.createSingleQuery(cabQuery);

        const detQuery = new SelectQuery(`
            SELECT * FROM cxp_detall_factur WHERE ide_cpcfa = $1 ORDER BY ide_cpdfa
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
     * Obtiene el porcentaje de IVA a una fecha
     */
    async getPorcentajeIva(fecha: string): Promise<number> {
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
    }
}
