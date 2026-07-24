import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { DocumentosCxPService } from './documentos-cxp.service';
import { IdDocumentoCxPDto } from './dto/save-retencion-cxp.dto';

/** Identificador de configuración contable para el casillero de renta por artículo */
const IDENTIFICADOR_RENTA_CXP = 'RETENCION RENTA POR PAGAR';

export interface SugerenciaDetalleRetencion {
    ide_cncim: number;
    nombre_cncim: string | null;
    porcentaje_cndre: number;
    base_cndre: number;
    valor_cndre: number;
}

/**
 * Consultas del comprobante de retención en compras (con_cabece_retenc /
 * con_detall_retenc). Migrado de componentes/Retencion.java del legacy.
 */
@Injectable()
export class RetencionesCxPService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly consultas: DocumentosCxPService,
    ) {
        super();
        this.core
            .getVariables([
                'p_con_impuesto_iva30',
                'p_con_impuesto_iva70',
                'p_con_impuesto_iva100',
                'p_inv_articulo_bien',
                'p_inv_articulo_servicio',
                'p_inv_articulo_honorarios',
                'p_inv_articulo_activo_fijo',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Retorna el comprobante de retención asociado a un documento CxP
     */
    async getRetencionDocumento(dtoIn: IdDocumentoCxPDto & HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT r.ide_cncre,
                   r.numero_cncre,
                   r.autorizacion_cncre,
                   r.fecha_emisi_cncre,
                   r.observacion_cncre,
                   r.correo_cncre,
                   r.ide_cnere,
                   r.ide_srcom,
                   d.ide_cpcfa
            FROM con_cabece_retenc r
            INNER JOIN cxp_cabece_factur d ON d.ide_cncre = r.ide_cncre
            WHERE d.ide_cpcfa = $1
            LIMIT 1
        `);
        qCab.addIntParam(1, dtoIn.ide_cpcfa);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) return { cabecera: null, detalles: [] };

        const qDet = new SelectQuery(`
            SELECT d.ide_cndre,
                   d.ide_cncim,
                   i.nombre_cncim,
                   i.casillero_cncim,
                   d.porcentaje_cndre,
                   d.base_cndre,
                   d.valor_cndre
            FROM con_detall_retenc d
            LEFT JOIN con_cabece_impues i ON d.ide_cncim = i.ide_cncim
            WHERE d.ide_cncre = $1
            ORDER BY d.ide_cndre
        `);
        qDet.addIntParam(1, Number(cabecera.ide_cncre));
        const detalles = await this.dataSource.createSelectQuery(qDet);
        return { cabecera, detalles };
    }

    /**
     * Combo de impuestos de retención (con_cabece_impues)
     */
    async getListDataImpuestosRetencion() {
        const query = new SelectQuery(`
            SELECT CAST(ide_cncim AS VARCHAR) AS value,
                   nombre_cncim || ' - ' || COALESCE(casillero_cncim, '') AS label,
                   valor_defecto_cncim,
                   ide_cnimp
            FROM con_cabece_impues
            ORDER BY nombre_cncim
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Puntos de emisión para comprobantes de retención (cxc_datos_fac, ide_cntdoc=8)
     */
    async getPuntosEmisionRetencion(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT CAST(ide_ccdaf AS VARCHAR) AS value,
                   serie_ccdaf || ' ' || COALESCE(autorizacion_ccdaf, '') AS label,
                   observacion_ccdaf
            FROM cxc_datos_fac
            WHERE ide_cntdoc = 8
              AND ide_sucu = $1
        `);
        query.addIntParam(1, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Arma la data para crear una retención de un documento CxP: datos del
     * documento y proveedor, bases imponibles, sugerencia de detalles (renta
     * por casillero configurado por artículo e IVA 30/70/100 según el tipo de
     * artículo) y número/autorización sugeridos para retención física.
     */
    async getDatosNuevaRetencion(dtoIn: IdDocumentoCxPDto & HeaderParamsDto) {
        // ── Documento ────────────────────────────────────────────────────────
        const qDoc = new SelectQuery(`
            SELECT d.ide_cpcfa, d.ide_geper, d.ide_cntdo, d.numero_cpcfa,
                   d.fecha_emisi_cpcfa, d.base_grabada_cpcfa, d.base_tarifa0_cpcfa,
                   d.base_no_objeto_iva_cpcfa, d.valor_iva_cpcfa, d.total_cpcfa,
                   d.ide_cncre, t.nombre_cntdo
            FROM cxp_cabece_factur d
            INNER JOIN con_tipo_document t ON d.ide_cntdo = t.ide_cntdo
            WHERE d.ide_cpcfa = $1
        `);
        qDoc.addIntParam(1, dtoIn.ide_cpcfa);
        const doc = await this.dataSource.createSingleQuery(qDoc);
        if (!doc) throw new BadRequestException(`El documento ide_cpcfa=${dtoIn.ide_cpcfa} no existe.`);
        if (doc.ide_cncre) {
            throw new BadRequestException('El documento ya tiene un comprobante de retención registrado.');
        }

        // ── Proveedor ────────────────────────────────────────────────────────
        const qProv = new SelectQuery(`
            SELECT p.ide_geper, p.nom_geper, p.identificac_geper, p.direccion_geper,
                   p.correo_geper, p.ide_cntco
            FROM gen_persona p
            WHERE p.ide_geper = $1
        `);
        qProv.addIntParam(1, Number(doc.ide_geper));
        const proveedor = await this.dataSource.createSingleQuery(qProv);

        // Correo usado en la última retención del proveedor (paridad legacy)
        const qCorreo = new SelectQuery(`
            SELECT a.correo_cncre
            FROM con_cabece_retenc a
            INNER JOIN cxp_cabece_factur b ON a.ide_cncre = b.ide_cncre
            WHERE b.ide_geper = $1
            ORDER BY b.ide_cpcfa DESC
            LIMIT 1
        `);
        qCorreo.addIntParam(1, Number(doc.ide_geper));
        const correoRet = await this.dataSource.createSingleQuery(qCorreo);

        const baseRenta = Number(doc.base_grabada_cpcfa || 0)
            + Number(doc.base_tarifa0_cpcfa || 0)
            + Number(doc.base_no_objeto_iva_cpcfa || 0);
        const baseIva = Number(doc.valor_iva_cpcfa || 0);

        // ── Detalles del documento ──────────────────────────────────────────
        const qDet = new SelectQuery(`
            SELECT ide_inarti, valor_cpdfa, iva_inarti_cpdfa
            FROM cxp_detall_factur
            WHERE ide_cpcfa = $1
        `);
        qDet.addIntParam(1, dtoIn.ide_cpcfa);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        const sugerencias = await this.getSugerenciaDetalles(
            detalles, Number(doc.ide_geper), Number(doc.ide_cntdo), doc.fecha_emisi_cpcfa, dtoIn,
        );

        // ── Número/autorización sugeridos (retención física) ────────────────
        const sugerenciaNumero = await this.getSugerenciaNumeroRetencion(dtoIn.ideSucu);

        return {
            documento: {
                ide_cpcfa: Number(doc.ide_cpcfa),
                numero_cpcfa: doc.numero_cpcfa,
                nombre_cntdo: doc.nombre_cntdo,
                fecha_emisi_cpcfa: doc.fecha_emisi_cpcfa,
                total_cpcfa: Number(doc.total_cpcfa || 0),
            },
            proveedor: {
                ide_geper: Number(doc.ide_geper),
                nom_geper: proveedor?.nom_geper ?? null,
                identificac_geper: proveedor?.identificac_geper ?? null,
                direccion_geper: proveedor?.direccion_geper ?? null,
                correo: correoRet?.correo_cncre ?? proveedor?.correo_geper ?? null,
            },
            base_imponible_renta: Number(baseRenta.toFixed(2)),
            base_imponible_iva: Number(baseIva.toFixed(2)),
            observacion_sugerida: `Retención Factura N. ${doc.numero_cpcfa}`,
            fecha_emisi_cncre: doc.fecha_emisi_cpcfa,
            numero_sugerido: sugerenciaNumero.numero,
            autorizacion_sugerida: sugerenciaNumero.autorizacion,
            detalles_sugeridos: sugerencias,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS (sugerencia de retenciones)
    // ─────────────────────────────────────────────────────────────────────────

    private async getSugerenciaDetalles(
        detalles: any[],
        ideGeper: number,
        ideCntdo: number,
        fechaEmision: string,
        dtoIn: HeaderParamsDto,
    ): Promise<SugerenciaDetalleRetencion[]> {
        const sugerencias: SugerenciaDetalleRetencion[] = [];
        if (!detalles.length) return sugerencias;

        const idsArticulos = [...new Set(detalles.map((d) => Number(d.ide_inarti)).filter(Boolean))];
        if (!idsArticulos.length) return sugerencias;

        // ── RENTA: casillero configurado por artículo (recursivo por el padre) ──
        const qCasilleros = new SelectQuery(`
            WITH RECURSIVE arti AS (
                SELECT ide_inarti AS raiz, ide_inarti, inv_ide_inarti, 0 AS nivel
                FROM inv_articulo
                WHERE ide_inarti = ANY($1)
                UNION ALL
                SELECT a.raiz, i.ide_inarti, i.inv_ide_inarti, a.nivel + 1
                FROM arti a
                JOIN inv_articulo i ON i.ide_inarti = a.inv_ide_inarti
                WHERE a.nivel < 10
            )
            SELECT DISTINCT ON (arti.raiz) arti.raiz AS ide_inarti, d.ide_cncim
            FROM arti
            JOIN con_det_conf_asie d ON d.ide_inarti = arti.ide_inarti
            JOIN con_vig_conf_asie v ON v.ide_cnvca = d.ide_cnvca AND v.estado_cnvca = true
            JOIN con_cab_conf_asie c ON c.ide_cncca = v.ide_cncca
            WHERE UPPER(c.nombre_cncca) = $2
              AND v.ide_sucu = $3
              AND d.ide_cncim IS NOT NULL
            ORDER BY arti.raiz, arti.nivel
        `);
        qCasilleros.addParam(1, idsArticulos);
        qCasilleros.addStringParam(2, IDENTIFICADOR_RENTA_CXP);
        qCasilleros.addIntParam(3, dtoIn.ideSucu);
        const casillerosRows = await this.dataSource.createSelectQuery(qCasilleros);
        const casilleroPorArticulo = new Map<number, number>(
            casillerosRows.map((r: any) => [Number(r.ide_inarti), Number(r.ide_cncim)]),
        );

        // Suma de bases por casillero de renta
        const basePorCasillero = new Map<number, number>();
        for (const det of detalles) {
            const casillero = casilleroPorArticulo.get(Number(det.ide_inarti));
            if (!casillero) continue;
            basePorCasillero.set(casillero, (basePorCasillero.get(casillero) ?? 0) + Number(det.valor_cpdfa || 0));
        }

        for (const [ideCncim, base] of basePorCasillero) {
            const porcentaje = await this.getPorcentajeImpuesto(ideCncim, ideGeper, ideCntdo);
            if (porcentaje === null) continue;
            sugerencias.push(this.buildSugerencia(ideCncim, porcentaje, base));
        }

        // ── IVA 30/70/100 según el tipo raíz del artículo ────────────────────
        const tipoBien = Number(this.variables.get('p_inv_articulo_bien'));
        const tipoServicio = Number(this.variables.get('p_inv_articulo_servicio'));
        const tipoHonorarios = Number(this.variables.get('p_inv_articulo_honorarios'));
        const tipoActivoFijo = Number(this.variables.get('p_inv_articulo_activo_fijo'));

        const qRaiz = new SelectQuery(`
            WITH RECURSIVE arti AS (
                SELECT ide_inarti AS origen, ide_inarti, inv_ide_inarti, 0 AS nivel
                FROM inv_articulo
                WHERE ide_inarti = ANY($1)
                UNION ALL
                SELECT a.origen, i.ide_inarti, i.inv_ide_inarti, a.nivel + 1
                FROM arti a
                JOIN inv_articulo i ON i.ide_inarti = a.inv_ide_inarti
                WHERE a.nivel < 10
            )
            SELECT origen AS ide_inarti, ide_inarti AS raiz
            FROM arti
            WHERE inv_ide_inarti IS NULL
        `);
        qRaiz.addParam(1, idsArticulos);
        const raices = await this.dataSource.createSelectQuery(qRaiz);
        const raizPorArticulo = new Map<number, number>(
            raices.map((r: any) => [Number(r.ide_inarti), Number(r.raiz)]),
        );

        let baseIva30 = 0;
        let baseIva70 = 0;
        let baseIva100 = 0;
        for (const det of detalles) {
            if (String(det.iva_inarti_cpdfa) !== '1') continue;
            const raiz = raizPorArticulo.get(Number(det.ide_inarti));
            const valor = Number(det.valor_cpdfa || 0);
            if (raiz === tipoBien || raiz === tipoActivoFijo) baseIva30 += valor;
            else if (raiz === tipoServicio) baseIva70 += valor;
            else if (raiz === tipoHonorarios) baseIva100 += valor;
        }

        const tarifaIva = await this.consultas.getPorcentajeIva(fechaEmision);
        const impuestosIva: Array<[string, number]> = [
            ['p_con_impuesto_iva30', baseIva30],
            ['p_con_impuesto_iva70', baseIva70],
            ['p_con_impuesto_iva100', baseIva100],
        ];
        for (const [variable, baseGravada] of impuestosIva) {
            if (baseGravada === 0) continue;
            const ideCncim = Number(this.variables.get(variable));
            if (!ideCncim) continue;
            const porcentaje = await this.getPorcentajeImpuesto(ideCncim, ideGeper, ideCntdo);
            if (porcentaje === null || porcentaje === 0) continue;
            const baseIvaLinea = Number((baseGravada * tarifaIva).toFixed(2));
            sugerencias.push(this.buildSugerencia(ideCncim, porcentaje, baseIvaLinea));
        }

        // Completar nombres de impuestos
        await this.completarNombresImpuestos(sugerencias);
        return sugerencias;
    }

    private buildSugerencia(ideCncim: number, porcentaje: number, base: number): SugerenciaDetalleRetencion {
        const baseRedondeada = Number(base.toFixed(2));
        return {
            ide_cncim: ideCncim,
            nombre_cncim: null,
            porcentaje_cndre: porcentaje,
            base_cndre: baseRedondeada,
            valor_cndre: Number(((baseRedondeada * porcentaje) / 100).toFixed(2)),
        };
    }

    /**
     * Porcentaje de retención vigente del impuesto según tipo de documento y
     * tipo de contribuyente del proveedor; fallback al valor por defecto del
     * impuesto (paridad obtener_porcen + getValorDefectoImpuesto legacy)
     */
    private async getPorcentajeImpuesto(
        ideCncim: number,
        ideGeper: number,
        ideCntdo: number,
    ): Promise<number | null> {
        const q = new SelectQuery(`
            SELECT porcentaje_cndim
            FROM con_detall_impues
            WHERE ide_cnvim = (
                    SELECT ide_cnvim FROM con_vigenc_impues
                    WHERE ide_cncim = $1 AND estado_cnvim IS TRUE
                    LIMIT 1
                  )
              AND ide_cntdo = $2
              AND ide_cntco = (SELECT ide_cntco FROM gen_persona WHERE ide_geper = $3)
            LIMIT 1
        `);
        q.addIntParam(1, ideCncim);
        q.addIntParam(2, ideCntdo);
        q.addIntParam(3, ideGeper);
        const row = await this.dataSource.createSingleQuery(q);
        if (row?.porcentaje_cndim !== undefined && row?.porcentaje_cndim !== null) {
            return Number(row.porcentaje_cndim);
        }

        const qDefecto = new SelectQuery(`
            SELECT valor_defecto_cncim FROM con_cabece_impues WHERE ide_cncim = $1
        `);
        qDefecto.addIntParam(1, ideCncim);
        const defecto = await this.dataSource.createSingleQuery(qDefecto);
        if (defecto?.valor_defecto_cncim !== undefined && defecto?.valor_defecto_cncim !== null) {
            return Number(defecto.valor_defecto_cncim);
        }
        return null;
    }

    private async completarNombresImpuestos(sugerencias: SugerenciaDetalleRetencion[]) {
        if (!sugerencias.length) return;
        const ids = [...new Set(sugerencias.map((s) => s.ide_cncim))];
        const q = new SelectQuery(`
            SELECT ide_cncim, nombre_cncim FROM con_cabece_impues WHERE ide_cncim = ANY($1)
        `);
        q.addParam(1, ids);
        const rows = await this.dataSource.createSelectQuery(q);
        const nombres = new Map<number, string>(rows.map((r: any) => [Number(r.ide_cncim), r.nombre_cncim]));
        for (const s of sugerencias) {
            s.nombre_cncim = nombres.get(s.ide_cncim) ?? null;
        }
    }

    /**
     * Autorización de la última retención física y siguiente número secuencial
     * (paridad getNumeroAutorizacion + getNumeroRetencion legacy)
     */
    private async getSugerenciaNumeroRetencion(ideSucu: number) {
        const qAut = new SelectQuery(`
            SELECT autorizacion_cncre
            FROM con_cabece_retenc
            WHERE ide_sucu = $1
              AND es_venta_cncre IS FALSE
              AND autorizacion_cncre NOT LIKE '0000000000'
              AND autorizacion_cncre IS NOT NULL
            ORDER BY ide_cncre DESC
            LIMIT 1
        `);
        qAut.addIntParam(1, ideSucu);
        const aut = await this.dataSource.createSingleQuery(qAut);
        if (!aut?.autorizacion_cncre) return { numero: null, autorizacion: null };

        const qNum = new SelectQuery(`
            SELECT MAX(CAST(COALESCE(NULLIF(regexp_replace(numero_cncre, '[^0-9]', '', 'g'), ''), '0') AS BIGINT)) AS num_retencion
            FROM con_cabece_retenc
            WHERE ide_sucu = $1
              AND autorizacion_cncre = $2
              AND es_venta_cncre IS FALSE
        `);
        qNum.addIntParam(1, ideSucu);
        qNum.addStringParam(2, aut.autorizacion_cncre);
        const num = await this.dataSource.createSingleQuery(qNum);
        if (!num?.num_retencion) return { numero: null, autorizacion: aut.autorizacion_cncre };

        const numMax = String(num.num_retencion).padStart(14, '0');
        const prefijo = numMax.substring(0, 6);
        const secuencial = (Number.parseInt(numMax.substring(6), 10) || 0) + 1;
        return {
            numero: prefijo + String(secuencial).padStart(9, '0'),
            autorizacion: aut.autorizacion_cncre,
        };
    }
}
