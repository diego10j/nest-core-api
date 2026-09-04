import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { EstadoComprobanteEnum } from 'src/core/modules/sri/cel/enum/estado-comprobante.enum';
import { normalizeString } from 'src/util/helpers/sql-util';

import { GetNoContabilizadosDto } from '../facturas/dto/get-no-contabilizados.dto';

import { GetNotaCreditoDto } from './dto/get-nota-credito.dto';
import { GetNotasCreditoDto } from './dto/get-notas-credito.dto';
import { GetTotalNotasCreditoPorEstadoDto } from './dto/get-total-notas-credito-por-estado.dto';
import { SearchFacturaNotaCreditoDto } from './dto/search-factura-nota-credito.dto';

/** Estado "normal" de cxp_cabecera_nota.ide_cpeno (paridad con notas-credito-save.service.ts) */
const IDE_CPENO_NORMAL = 1;
const IDE_CPENO_ANULADO = 0;

/**
 * Servicio de consultas para notas de crédito de VENTAS (cxp_cabecera_nota, pese al
 * prefijo "cxp_" son de CxC — ver nota en notas-credito-save.service.ts).
 */
@Injectable()
export class NotasCreditoService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables(['p_con_tipo_documento_nota_credito', 'p_gen_tipo_identif_consumidor_final'])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Puntos de emisión configurados para Notas de Crédito (cxc_datos_fac con
     * ide_cntdoc = p_con_tipo_documento_nota_credito) — mismo patrón que
     * FacturasService#getPuntosEmisionFacturas, pero con el tipo de documento propio de
     * la NC (04), no el de factura. Incluye las filas de la sucursal actual y las de
     * alcance "todas las sucursales" (ide_sucu=0), igual que el patrón de identificadores
     * contables ya usado en esta sesión.
     */
    async getPuntosEmisionNotasCredito(dtoIn: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                a.ide_ccdaf,
                a.establecimiento_ccdfa,
                a.pto_emision_ccdfa,
                a.observacion_ccdaf,
                b.nom_sucu
            FROM cxc_datos_fac a
            INNER JOIN sis_sucursal b ON a.ide_sucu = b.ide_sucu
            WHERE a.ide_cntdoc = ${Number(this.variables.get('p_con_tipo_documento_nota_credito'))}
              AND a.ide_empr = ${dtoIn.ideEmpr}
              AND (a.ide_sucu = ${dtoIn.ideSucu} OR a.ide_sucu = 0)
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna las notas de crédito de VENTAS de un mes/período, filtradas por estado de
     * contabilización (para el proceso de generación de asientos / Mayorizar)
     */
    async getNotasNoContabilizadas(dtoIn: GetNoContabilizadosDto & HeaderParamsDto) {
        const condicionEstado =
            dtoIn.estado === 'CON_ASIENTO'
                ? 'AND a.ide_cnccc IS NOT NULL'
                : dtoIn.estado === 'TODAS'
                    ? ''
                    : 'AND a.ide_cnccc IS NULL';
        const query = new SelectQuery(`
            SELECT a.ide_cpcno,
                   a.numero_cpcno,
                   a.fecha_emisi_cpcno,
                   a.ide_cnccc,
                   a.ide_cnccc_costo,
                   b.nom_geper,
                   b.identificac_geper,
                   a.base_grabada_cpcno AS ventas12,
                   a.base_tarifa0_cpcno + a.base_no_objeto_iva_cpcno AS ventas0,
                   a.valor_iva_cpcno,
                   a.total_cpcno,
                   a.num_doc_mod_cpcno,
                   a.observacion_cpcno,
                   a.fecha_trans_cpcno,
                   a.ide_geper
            FROM cxp_cabecera_nota a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            WHERE EXTRACT(MONTH FROM a.fecha_emisi_cpcno) = $1
              AND EXTRACT(YEAR FROM a.fecha_emisi_cpcno) = $2
              AND a.ide_sucu = $3
              AND a.ide_cpeno = ${IDE_CPENO_NORMAL}
              ${condicionEstado}
            ORDER BY a.numero_cpcno DESC, a.ide_cpcno DESC
        `);
        query.addIntParam(1, dtoIn.mes);
        query.addIntParam(2, dtoIn.periodo);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Conteo de notas de crédito de venta por estado SRI, para las tabs del listado —
     * mismo patrón que FacturasService#getTotalFacturasPorEstado, sustituyendo
     * cxc_cabece_factura/ide_ccefa por cxp_cabecera_nota/ide_cpeno.
     */
    async getTotalNotasCreditoPorEstado(dtoIn: GetTotalNotasCreditoPorEstadoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT ide_sresc, contador, nombre_sresc, icono_sresc, color_sresc
            FROM (
                -- Un registro por cada estado SRI que tenga notas de crédito normales
                SELECT
                    f.ide_sresc,
                    COUNT(a.ide_cpcno) AS contador,
                    f.nombre_sresc,
                    f.icono_sresc,
                    f.color_sresc,
                    f.orden_sresc
                FROM sri_estado_comprobante f
                LEFT JOIN sri_comprobante d ON d.ide_sresc = f.ide_sresc
                LEFT JOIN cxp_cabecera_nota a ON a.ide_srcom = d.ide_srcom
                    AND a.fecha_emisi_cpcno BETWEEN $1 AND $2
                    AND a.ide_sucu = $3
                    AND a.ide_cpeno = ${IDE_CPENO_NORMAL}
                GROUP BY f.orden_sresc, f.ide_sresc, f.icono_sresc, f.color_sresc, f.nombre_sresc

                UNION ALL

                -- Fila anuladas (ide_cpeno = 0)
                SELECT
                    0 AS ide_sresc,
                    COUNT(a.ide_cpcno) AS contador,
                    'ANULADAS' AS nombre_sresc,
                    'fluent:document-dismiss-24-regular' AS icono_sresc,
                    'error' AS color_sresc,
                    999 AS orden_sresc
                FROM cxp_cabecera_nota a
                WHERE a.fecha_emisi_cpcno BETWEEN $1 AND $2
                  AND a.ide_sucu = $3
                  AND a.ide_cpeno = ${IDE_CPENO_ANULADO}

                UNION ALL

                -- Fila total general (normales solamente, igual que el detallado por defecto)
                SELECT
                    100 AS ide_sresc,
                    COUNT(a.ide_cpcno) AS contador,
                    'TODAS' AS nombre_sresc,
                    'fluent:document-text-24-regular' AS icono_sresc,
                    'default' AS color_sresc,
                    -1 AS orden_sresc
                FROM cxp_cabecera_nota a
                WHERE a.fecha_emisi_cpcno BETWEEN $1 AND $2
                  AND a.ide_sucu = $3
                  AND a.ide_cpeno = ${IDE_CPENO_NORMAL}
            ) AS combined
            ORDER BY orden_sresc
        `);
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        query.addParam(3, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Búsqueda de facturas para crear una nota de crédito, por número o cliente, SIN
     * acotar a un cliente conocido de antemano (a diferencia de
     * ClientesService#searchDocumentoCliente, usado en "Editar Transacciones CxC"). Solo
     * devuelve facturas que ya cumplirían las reglas normativas de
     * NotasCreditoSaveService#saveNotaCredito (autorizada por el SRI, no consumidor
     * final), para no dejar elegir en la búsqueda algo que luego el guardado rechazará.
     */
    async searchFacturaNotaCredito(dtoIn: SearchFacturaNotaCreditoDto & HeaderParamsDto) {
        const ideGetidConsumidorFinal = Number(this.variables.get('p_gen_tipo_identif_consumidor_final'));
        const sqlSearchValue = `%${normalizeString((dtoIn.value ?? '').trim())}%`;
        const query = new SelectQuery(`
            SELECT
                cf.ide_cccfa, cf.secuencial_cccfa AS numero_cccfa, cf.fecha_emisi_cccfa,
                cf.total_cccfa, cf.pagado_cccfa, cf.ide_ccdaf,
                p.ide_geper, p.nom_geper, p.identificac_geper, p.correo_geper
            FROM cxc_cabece_factura cf
            INNER JOIN gen_persona p ON p.ide_geper = cf.ide_geper
            LEFT JOIN sri_comprobante sc ON sc.ide_srcom = cf.ide_srcom
            WHERE cf.ide_empr = ${dtoIn.ideEmpr} AND cf.ide_sucu = ${dtoIn.ideSucu}
              AND sc.ide_sresc = ${EstadoComprobanteEnum.AUTORIZADO.codigo}
              AND p.ide_getid IS DISTINCT FROM ${ideGetidConsumidorFinal}
              AND (
                    regexp_replace(unaccent(LOWER(COALESCE(cf.secuencial_cccfa, ''))), '[^a-z0-9]', '', 'g') LIKE $1
                 OR regexp_replace(unaccent(LOWER(COALESCE(p.nom_geper, ''))), '[^a-z0-9]', '', 'g') LIKE $1
                 OR regexp_replace(unaccent(LOWER(COALESCE(p.identificac_geper, ''))), '[^a-z0-9]', '', 'g') LIKE $1
              )
            ORDER BY cf.fecha_emisi_cccfa DESC
            LIMIT ${dtoIn.limit}
        `);
        query.addStringParam(1, sqlSearchValue);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Listado paginado de notas de crédito de venta (pantalla "Notas de Crédito"), con
     * cliente, factura origen y estado SRI — mismo patrón que FacturasService#getFacturas.
     */
    async getNotasCredito(dtoIn: GetNotasCreditoDto & HeaderParamsDto) {
        const condIdeCpeno = Number(dtoIn.ide_sresc) === 0 ? `AND a.ide_cpeno = ${IDE_CPENO_ANULADO}` : `AND a.ide_cpeno = ${IDE_CPENO_NORMAL}`;
        const condEstadoSri = dtoIn.ide_sresc && Number(dtoIn.ide_sresc) !== 0 ? `AND s.ide_sresc = ${Number(dtoIn.ide_sresc)}` : '';

        const query = new SelectQuery(
            `
            SELECT
                a.ide_cpcno,
                a.numero_cpcno,
                a.fecha_emisi_cpcno,
                a.num_doc_mod_cpcno,
                a.total_cpcno,
                a.base_grabada_cpcno,
                a.base_tarifa0_cpcno + a.base_no_objeto_iva_cpcno AS base0,
                a.valor_iva_cpcno,
                a.descuento_cpcno,
                a.ide_cccfa,
                a.ide_cpeno,
                a.ide_geper,
                b.nom_geper,
                b.identificac_geper,
                m.nombre_cpmno,
                s.ide_sresc,
                COALESCE(f.nombre_sresc, '') AS nombre_sresc,
                s.claveacceso_srcom,
                a.usuario_ingre
            FROM cxp_cabecera_nota a
            INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
            LEFT JOIN cxp_motivo_nota m ON a.ide_cpmno = m.ide_cpmno
            LEFT JOIN sri_comprobante s ON a.ide_srcom = s.ide_srcom
            LEFT JOIN sri_estado_comprobante f ON s.ide_sresc = f.ide_sresc
            WHERE a.fecha_emisi_cpcno BETWEEN $1 AND $2
              AND a.ide_sucu = ${dtoIn.ideSucu}
              AND a.ide_empr = ${dtoIn.ideEmpr}
              ${condIdeCpeno}
              ${condEstadoSri}
            ORDER BY a.ide_cpcno DESC
            `,
            dtoIn,
        );
        query.addParam(1, dtoIn.fechaInicio);
        query.addParam(2, dtoIn.fechaFin);
        return this.dataSource.createQuery(query);
    }

    /**
     * Detalle de una nota de crédito para ver/editar: cabecera + persona + motivo +
     * estado SRI + detalle de líneas (con descuento). Reusa el mismo join de
     * NotasCreditoRepService#reportNotaCredito, sin la parte de generación de PDF.
     */
    async getNotaCreditoById(dtoIn: GetNotaCreditoDto & HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                a.ide_cpcno, a.ide_cccfa, a.ide_ccdaf, a.ide_cpmno, a.ide_cndfp,
                a.numero_cpcno, a.fecha_emisi_cpcno, a.observacion_cpcno,
                a.num_doc_mod_cpcno, a.fecha_emision_mod_cpcno, a.valor_mod_cpcno,
                a.base_grabada_cpcno, a.base_tarifa0_cpcno, a.base_no_objeto_iva_cpcno,
                a.valor_iva_cpcno, a.tarifa_iva_cpcno, a.total_cpcno, a.descuento_cpcno,
                a.ide_cpeno, a.ide_geper,
                p.nom_geper, p.identificac_geper, p.direccion_geper, p.telefono_geper, p.correo_geper,
                m.nombre_cpmno,
                fp.nombre_cndfp,
                s.ide_sresc, s.claveacceso_srcom, s.autorizacion_srcomn, s.fechaautoriza_srcom,
                COALESCE(f.nombre_sresc, '') AS nombre_sresc
            FROM cxp_cabecera_nota a
            INNER JOIN gen_persona p ON a.ide_geper = p.ide_geper
            LEFT JOIN cxp_motivo_nota m ON a.ide_cpmno = m.ide_cpmno
            LEFT JOIN con_deta_forma_pago fp ON a.ide_cndfp = fp.ide_cndfp
            LEFT JOIN sri_comprobante s ON a.ide_srcom = s.ide_srcom
            LEFT JOIN sri_estado_comprobante f ON s.ide_sresc = f.ide_sresc
            WHERE a.ide_cpcno = $1 AND a.ide_empr = $2
        `);
        qCab.addIntParam(1, dtoIn.ide_cpcno);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) {
            throw new NotFoundException(`Nota de crédito ide_cpcno=${dtoIn.ide_cpcno} no encontrada.`);
        }

        const qDet = new SelectQuery(`
            SELECT
                d.ide_cpdno, d.ide_inarti, f.codigo_inarti, f.nombre_inarti,
                d.ide_inuni, u.siglas_inuni,
                d.cantidad_cpdno, d.precio_cpdno, d.valor_cpdno, d.observacion_cpdno, d.iva_inarti_cpdno,
                d.descuento_cpdno, d.porcentaje_descuento_cpdno
            FROM cxp_detalle_nota d
            INNER JOIN inv_articulo f ON d.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad u ON d.ide_inuni = u.ide_inuni
            WHERE d.ide_cpcno = $1
            ORDER BY d.ide_cpdno
        `);
        qDet.addIntParam(1, dtoIn.ide_cpcno);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        return { ...cabecera, detalles };
    }
}
