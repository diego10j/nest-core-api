import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import {
    AtsAirDetalleDto,
    AtsAnexoDto,
    AtsAnuladoDto,
    AtsCompraDto,
    AtsQueryDto,
    AtsReembolsoDto,
    AtsVentaDto,
    AtsVentaEstablecimientoDto,
} from './dto/ats.dto';

/** Renta (con_impuesto.ide_cnimp) — no existe como variable de sistema, hardcoded igual que el legacy. */
const IDE_CNIMP_RENTA = 1;
/** con_tipo_document.ide_cntdo "Importaciones": no se reporta en el ATS (paridad legacy). */
const IDE_CNTDO_IMPORTACIONES = '11';
/** cxp_cabecera_nota (notas de crédito de venta) — estado "normal", hardcoded igual que el legacy. */
const IDE_CPENO_NORMAL = 1;
/** Umbral de total de compra a partir del cual se reporta la forma de pago (heredado del legacy, antes 1000). */
const UMBRAL_FORMA_PAGO = 500;

/**
 * Generación del Anexo Transaccional Simplificado (ATS) — sección "Comprobantes Electrónicos".
 * Puerto fiel de pkg_sri.cls_anexo_transaccional_electronicos.AnexoTransaccional del legacy
 * sigafi-ceo (la única invocada desde el menú "Anexo Transaccional (ATS)" con esa opción; la
 * variante `cls_anexo_transaccional` de las otras 4 opciones del menú, orientada solo a
 * retenciones físicas, no se migró).
 *
 * Simplificaciones deliberadas respecto al legacy, porque el código muerto/inalcanzable del
 * original así lo evidenciaba (se documentan en línea donde aplica):
 *  - El branch de "pagoExterior" para importaciones nunca se alcanzaba (las importaciones ya se
 *    excluyen antes con `continue`), así que aquí `pagoExterior` es siempre el valor local fijo.
 *  - El bloque de `tipoProv`/`denoPr` para `ide_cntdo=11` tampoco se alcanzaba por la misma razón.
 */
@Injectable()
export class AtsService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxc_estado_factura_normal',
                'p_cxc_estado_factura_anulada',
                'p_cxp_estado_factura_normal',
                'p_con_tipo_documento_reembolso',
                'p_con_tipo_documento_nota_credito',
                'p_con_impuesto_iva30',
                'p_con_impuesto_iva70',
                'p_con_impuesto_iva100',
                'p_con_estado_comprobante_rete_anulado',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    private getVar(name: string): number {
        const val = this.variables.get(name);
        if (!isDefined(val)) {
            throw new InternalServerErrorException(`Variable del sistema '${name}' no configurada. Contacte al administrador.`);
        }
        return Number(val);
    }

    /** Arma el Anexo Transaccional Simplificado completo del período (año/mes), listo para el XML. */
    async generarAnexo(dtoIn: AtsQueryDto & HeaderParamsDto): Promise<AtsAnexoDto> {
        const opcion = dtoIn.opcionAnexo ?? '1';
        const anio = dtoIn.anio;
        const mes = String(dtoIn.mes).padStart(2, '0');
        const fechaInicio = `${anio}-${mes}-01`;
        const fechaFin = this.getUltimaFechaMes(anio, mes);

        const empresa = await this.getEmpresa(dtoIn.ideSucu);
        if (!empresa) {
            throw new BadRequestException('Debe ingresar la información de la empresa');
        }
        const establecimientos = await this.getEstablecimientos(fechaInicio, fechaFin, dtoIn.ideSucu);

        const incluyeCompras = opcion === '1' || opcion === '2';
        const incluyeVentas = opcion === '1' || opcion === '3';

        const compras = incluyeCompras ? await this.getCompras(fechaInicio, fechaFin, dtoIn.ideSucu) : null;

        let ventas: AtsVentaDto[] | null = null;
        let ventasEstablecimiento: AtsVentaEstablecimientoDto[] | null = null;
        if (incluyeVentas) {
            await this.actualizarRetencionesVenta(fechaInicio, fechaFin, dtoIn.ideSucu);
            ventas = await this.getVentas(fechaInicio, fechaFin, dtoIn.ideSucu);
            ventas.push(...await this.getNotasCreditoVenta(fechaInicio, fechaFin, dtoIn.ideSucu));
            ventasEstablecimiento = establecimientos.map((e) => ({
                codEstab: e.establecimiento,
                // Paridad legacy: el cálculo real de ventas/iva compensado está deshabilitado en el
                // origen (comentado) y siempre se reporta 0.00.
                ventasEstab: 0,
                ivaComp: 0,
            }));
        }

        const anulados = await this.getAnuladosFacturas(fechaInicio, fechaFin, dtoIn.ideSucu);
        anulados.push(...await this.getAnuladosRetenciones(fechaInicio, fechaFin, dtoIn.ideSucu));

        return {
            anio,
            mes,
            ruc: empresa.identicicacion_sucu,
            razonSocial: empresa.nom_sucu,
            numEstabRuc: `00${establecimientos.length}`,
            opcionAnexo: opcion,
            compras: compras ?? [],
            ventas: ventas ?? [],
            ventasEstablecimiento: ventasEstablecimiento ?? [],
            anulados,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cabecera
    // ─────────────────────────────────────────────────────────────────────────

    private async getEmpresa(ideSucu: number): Promise<{ identicicacion_sucu: string; nom_sucu: string } | undefined> {
        const query = new SelectQuery(`
            SELECT identicicacion_sucu, nom_sucu FROM sis_sucursal WHERE ide_sucu = $1
        `);
        query.addIntParam(1, ideSucu);
        return this.dataSource.createSingleQuery(query);
    }

    /** Establecimientos con ventas en el período (agrupado por los 3 primeros dígitos de la serie de facturación). */
    private async getEstablecimientos(
        fechaInicio: string, fechaFin: string, ideSucu: number,
    ): Promise<{ establecimiento: string }[]> {
        const query = new SelectQuery(`
            SELECT SUBSTR(df.serie_ccdaf, 1, 3) AS establecimiento
            FROM cxc_cabece_factura cf
            LEFT JOIN cxc_datos_fac df ON df.ide_ccdaf = cf.ide_ccdaf
            WHERE cf.fecha_emisi_cccfa BETWEEN $1 AND $2
              AND cf.ide_ccefa = $3
              AND cf.ide_sucu = $4
            GROUP BY SUBSTR(df.serie_ccdaf, 1, 3)
        `);
        query.addStringParam(1, fechaInicio);
        query.addStringParam(2, fechaFin);
        query.addIntParam(3, this.getVar('p_cxc_estado_factura_normal'));
        query.addIntParam(4, ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /** Último día calendario del mes indicado, en formato 'YYYY-MM-DD'. */
    private getUltimaFechaMes(anio: string, mes: string): string {
        const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate();
        return `${anio}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Compras
    // ─────────────────────────────────────────────────────────────────────────

    private async getCompras(fechaInicio: string, fechaFin: string, ideSucu: number): Promise<AtsCompraDto[]> {
        const ideTipoDocReembolso = this.getVar('p_con_tipo_documento_reembolso');
        const ideTipoDocNotaCredito = this.getVar('p_con_tipo_documento_nota_credito');
        const ideEstadoNormalCxp = this.getVar('p_cxp_estado_factura_normal');

        const query = new SelectQuery(`
            SELECT
                cabece.ide_cpcfa, cabece.ide_cncre, cabece.ide_cntdo,
                suste.alterno_srtst, iden.alterno1_getid, prove.identificac_geper, docu.alter_tribu_cntdo, docu.nombre_cntdo,
                cabece.numero_cpcfa, cabece.fecha_emisi_cpcfa, cabece.autorizacio_cpcfa,
                cabece.total_cpcfa, cabece.valor_ice_cpcfa,
                cabece.base_grabada_cpcfa, cabece.base_tarifa0_cpcfa, cabece.base_no_objeto_iva_cpcfa, cabece.valor_iva_cpcfa,
                rete.numero_cncre, rete.autorizacion_cncre, rete.fecha_emisi_cncre, dpa.alterno_ats,
                cabece.fecha_emision_nc_cpcfa, cabece.numero_nc_cpcfa, cabece.autorizacio_nc_cpcfa
            FROM cxp_cabece_factur cabece
            LEFT JOIN gen_persona prove ON cabece.ide_geper = prove.ide_geper
            LEFT JOIN sri_tipo_sustento_tributario suste ON cabece.ide_srtst = suste.ide_srtst
            LEFT JOIN gen_tipo_identifi iden ON prove.ide_getid = iden.ide_getid
            LEFT JOIN con_tipo_document docu ON cabece.ide_cntdo = docu.ide_cntdo
            LEFT JOIN con_cabece_retenc rete ON cabece.ide_cncre = rete.ide_cncre
            LEFT JOIN con_deta_forma_pago dpa ON cabece.ide_cndfp = dpa.ide_cndfp
            WHERE cabece.fecha_emisi_cpcfa BETWEEN $1 AND $2
              AND cabece.ide_rem_cpcfa IS NULL
              AND cabece.ide_cpefa = $3
              AND cabece.ide_sucu = $4
            ORDER BY cabece.fecha_emisi_cpcfa, cabece.ide_cpcfa
        `);
        query.addStringParam(1, fechaInicio);
        query.addStringParam(2, fechaFin);
        query.addIntParam(3, ideEstadoNormalCxp);
        query.addIntParam(4, ideSucu);
        const filas = await this.dataSource.createSelectQuery(query);

        const ideRetenciones = [...new Set(filas.map((f) => f.ide_cncre).filter((v) => isDefined(v)))] as number[];
        const [retIva30, retIva70, retIva100, retRenta] = await Promise.all([
            this.getRetencionPorCasillero(ideRetenciones, this.getVar('p_con_impuesto_iva30')),
            this.getRetencionPorCasillero(ideRetenciones, this.getVar('p_con_impuesto_iva70')),
            this.getRetencionPorCasillero(ideRetenciones, this.getVar('p_con_impuesto_iva100')),
            this.getRetencionRenta(ideRetenciones),
        ]);

        const compras: AtsCompraDto[] = [];
        for (const fila of filas) {
            if (String(fila.ide_cntdo) === IDE_CNTDO_IMPORTACIONES) {
                continue; // no reporta importaciones en ATS
            }

            const { estab, ptoEmi, secuencial } = this.splitNumero(fila.numero_cpcfa);
            const ideRetencion = fila.ide_cncre as number | null;
            const totalCpcfa = Number(fila.total_cpcfa ?? 0);
            const esReembolso = Number(fila.ide_cntdo) === ideTipoDocReembolso;

            const compra: AtsCompraDto = {
                codSustento: fila.alterno_srtst ?? '',
                tpIdProv: fila.alterno1_getid ?? '',
                idProv: fila.identificac_geper ?? '',
                tipoComprobante: fila.alter_tribu_cntdo ?? '',
                nombreTipoComprobante: fila.nombre_cntdo ?? undefined,
                parteRel: 'NO',
                fechaRegistro: fila.fecha_emisi_cncre ?? fila.fecha_emisi_cpcfa,
                establecimiento: estab,
                puntoEmision: ptoEmi,
                secuencial,
                fechaEmision: fila.fecha_emisi_cpcfa,
                autorizacion: fila.autorizacio_cpcfa,
                baseNoGraIva: Number(fila.base_no_objeto_iva_cpcfa ?? 0),
                baseImponible: Number(fila.base_tarifa0_cpcfa ?? 0),
                baseImpGrav: Number(fila.base_grabada_cpcfa ?? 0),
                baseImpExe: 0,
                montoIce: Number(fila.valor_ice_cpcfa ?? 0),
                montoIva: Number(fila.valor_iva_cpcfa ?? 0),
                valorRetBienes: retIva30.get(ideRetencion ?? -1) ?? 0,
                valorRetServicios: retIva70.get(ideRetencion ?? -1) ?? 0,
                valRetServ100: retIva100.get(ideRetencion ?? -1) ?? 0,
                totBasesImpReemb: esReembolso ? await this.getTotalBasesReembolso(fila.ide_cpcfa, ideEstadoNormalCxp) : 0,
                // Rama de importación de pagoExterior era inalcanzable en el legacy (las
                // importaciones ya se filtran arriba); se preserva únicamente el valor local.
                pagoExterior: { pagoLocExt: '01', paisEfecPago: 'NA', aplicConvDobTrib: 'NA', pagExtSujRetNorLeg: 'NA' },
                formaPago: totalCpcfa >= UMBRAL_FORMA_PAGO ? (fila.alterno_ats ?? undefined) : undefined,
                esReembolso,
                reembolsos: [],
                air: [],
            };

            if (esReembolso) {
                compra.reembolsos = await this.getReembolsosCompra(fila.ide_cpcfa, ideEstadoNormalCxp);
                if (compra.reembolsos.length > 0) {
                    const numeroRetencion = fila.numero_cncre as string | null;
                    if (numeroRetencion) {
                        const ret = this.splitNumero(numeroRetencion);
                        if (Number(ret.secuencial) > 0) {
                            compra.retencionAsociada = {
                                estabRetencion1: ret.estab,
                                ptoEmiRetencion1: ret.ptoEmi,
                                secRetencion1: String(Number(ret.secuencial)),
                                autRetencion1: fila.autorizacion_cncre,
                                // Paridad legacy: usa la fecha de emisión del documento, no la de la retención.
                                fechaEmiRet1: fila.fecha_emisi_cpcfa,
                            };
                        }
                    }
                }
            } else {
                compra.air = retRenta.get(ideRetencion ?? -1) ?? [];
            }

            if (ideTipoDocNotaCredito === Number(fila.ide_cntdo)) {
                const numeroDocModificado = String(fila.numero_nc_cpcfa ?? '').replace(/-/g, '');
                compra.docModificado = {
                    docModificado: '01', // hardcoded "factura" (limitación heredada del legacy)
                    estabModificado: numeroDocModificado.slice(0, 3),
                    ptoEmiModificado: numeroDocModificado.slice(3, 6),
                    secModificado: numeroDocModificado.slice(6),
                    autModificado: fila.autorizacio_nc_cpcfa,
                };
            }

            compras.push(compra);
        }
        return compras;
    }

    private async getRetencionPorCasillero(ideRetenciones: number[], ideCncim: number): Promise<Map<number, number>> {
        const mapa = new Map<number, number>();
        if (ideRetenciones.length === 0) return mapa;
        const query = new SelectQuery(`
            SELECT detalle.ide_cncim, valor_cndre, cabece.ide_cncre
            FROM con_cabece_retenc cabece
            INNER JOIN con_detall_retenc detalle ON detalle.ide_cncre = cabece.ide_cncre
            INNER JOIN con_cabece_impues impuesto ON detalle.ide_cncim = impuesto.ide_cncim
            WHERE impuesto.ide_cncim = $1 AND cabece.ide_cncre = ANY($2)
            ORDER BY cabece.ide_cncre
        `);
        query.addIntParam(1, ideCncim);
        query.addParam(2, ideRetenciones);
        const filas = await this.dataSource.createSelectQuery(query);
        for (const fila of filas) {
            const ideCncre = Number(fila.ide_cncre);
            if (!mapa.has(ideCncre)) mapa.set(ideCncre, Number(fila.valor_cndre ?? 0));
        }
        return mapa;
    }

    private async getRetencionRenta(ideRetenciones: number[]): Promise<Map<number, AtsAirDetalleDto[]>> {
        const mapa = new Map<number, AtsAirDetalleDto[]>();
        if (ideRetenciones.length === 0) return mapa;
        const query = new SelectQuery(`
            SELECT impuesto.casillero_cncim, impuesto.nombre_cncim, SUM(base_cndre) AS base_cndre, porcentaje_cndre,
                SUM(valor_cndre) AS valor_cndre, cabece.ide_cncre
            FROM con_cabece_retenc cabece
            INNER JOIN con_detall_retenc detalle ON detalle.ide_cncre = cabece.ide_cncre
            INNER JOIN con_cabece_impues impuesto ON detalle.ide_cncim = impuesto.ide_cncim
            WHERE impuesto.ide_cnimp = $1 AND cabece.ide_cncre = ANY($2)
            GROUP BY impuesto.casillero_cncim, impuesto.nombre_cncim, porcentaje_cndre, cabece.ide_cncre
            ORDER BY cabece.ide_cncre
        `);
        query.addIntParam(1, IDE_CNIMP_RENTA);
        query.addParam(2, ideRetenciones);
        const filas = await this.dataSource.createSelectQuery(query);
        for (const fila of filas) {
            const ideCncre = Number(fila.ide_cncre);
            const porcentaje = Number(fila.porcentaje_cndre ?? 0);
            const base = Number(fila.base_cndre ?? 0);
            const casillero = String(fila.casillero_cncim ?? '');
            const detalle: AtsAirDetalleDto = {
                codRetAir: casillero.startsWith('332') ? '332' : casillero,
                baseImpAir: base,
                porcentajeAir: porcentaje,
                valRetAir: Number(((porcentaje > 0 ? porcentaje / 100 : 0) * base).toFixed(2)),
                nombreConcepto: fila.nombre_cncim ?? undefined,
            };
            const lista = mapa.get(ideCncre) ?? [];
            lista.push(detalle);
            mapa.set(ideCncre, lista);
        }
        return mapa;
    }

    private async getTotalBasesReembolso(ideCpcfaPadre: number, ideEstadoNormalCxp: number): Promise<number> {
        const query = new SelectQuery(`
            SELECT SUM(base_tarifa0_cpcfa + base_grabada_cpcfa + base_no_objeto_iva_cpcfa) AS valor
            FROM cxp_cabece_factur
            WHERE ide_rem_cpcfa = $1 AND ide_cpefa = $2
        `);
        query.addIntParam(1, ideCpcfaPadre);
        query.addIntParam(2, ideEstadoNormalCxp);
        const res = await this.dataSource.createSingleQuery(query);
        return Number(res?.valor ?? 0);
    }

    private async getReembolsosCompra(ideCpcfaPadre: number, ideEstadoNormalCxp: number): Promise<AtsReembolsoDto[]> {
        const query = new SelectQuery(`
            SELECT ree.motivo_nc_cpcfa, tdo.alter_tribu_cntdo,
                ree.numero_cpcfa, ree.fecha_emisi_cpcfa, ree.autorizacio_cpcfa,
                ree.base_tarifa0_cpcfa, ree.base_grabada_cpcfa, ree.base_no_objeto_iva_cpcfa,
                ree.valor_iva_cpcfa, ree.valor_ice_cpcfa
            FROM cxp_cabece_factur ree
            INNER JOIN con_tipo_document tdo ON ree.ide_cntdo = tdo.ide_cntdo
            WHERE ree.ide_rem_cpcfa = $1 AND ree.ide_cpefa = $2
        `);
        query.addIntParam(1, ideCpcfaPadre);
        query.addIntParam(2, ideEstadoNormalCxp);
        const filas = await this.dataSource.createSelectQuery(query);
        return filas.map((f) => {
            const { estab, ptoEmi, secuencial } = this.splitNumero(f.numero_cpcfa);
            return {
                tipoComprobanteReemb: f.alter_tribu_cntdo ?? '',
                // Hardcoded "01" (Persona Natural) en el legacy — no distingue el tipo real del proveedor reembolsado.
                tpIdProvReemb: '01',
                idProvReemb: f.motivo_nc_cpcfa ?? '',
                establecimientoReemb: estab,
                puntoEmisionReemb: ptoEmi,
                secuencialReemb: secuencial,
                fechaEmisionReemb: f.fecha_emisi_cpcfa,
                autorizacionReemb: f.autorizacio_cpcfa,
                baseImponibleReemb: Number(f.base_tarifa0_cpcfa ?? 0),
                baseImpGravReemb: Number(f.base_grabada_cpcfa ?? 0),
                baseNoGraIvaReemb: Number(f.base_no_objeto_iva_cpcfa ?? 0),
                baseImpExeReemb: 0,
                montoIceRemb: Number(f.valor_ice_cpcfa ?? 0),
                montoIvaRemb: Number(f.valor_iva_cpcfa ?? 0),
            };
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ventas
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Materializa ret_iva_cccfa/ret_fuente_cccfa del período (paridad legacy: se recalculan antes
     * de leer las ventas, no se mantienen incrementalmente).
     */
    private async actualizarRetencionesVenta(fechaInicio: string, fechaFin: string, ideSucu: number): Promise<void> {
        await this.dataSource.pool.query(
            `UPDATE cxc_cabece_factura cab
             SET ret_iva_cccfa = (
                 SELECT SUM(valor_cndre) FROM con_cabece_retenc a
                 INNER JOIN con_detall_retenc b ON a.ide_cncre = b.ide_cncre
                 WHERE a.es_venta_cncre = TRUE
                   AND b.ide_cncim IN (SELECT ide_cncim FROM con_cabece_impues WHERE ide_cnimp = 0)
                   AND a.ide_cncre = cab.ide_cncre
             ),
             ret_fuente_cccfa = (
                 SELECT SUM(valor_cndre) FROM con_cabece_retenc a
                 INNER JOIN con_detall_retenc b ON a.ide_cncre = b.ide_cncre
                 WHERE a.es_venta_cncre = TRUE
                   AND b.ide_cncim IN (SELECT ide_cncim FROM con_cabece_impues WHERE ide_cnimp = 1)
                   AND a.ide_cncre = cab.ide_cncre
             )
             WHERE cab.fecha_emisi_cccfa BETWEEN $1 AND $2
               AND cab.ide_ccefa = $3
               AND cab.ide_sucu = $4`,
            [fechaInicio, fechaFin, this.getVar('p_cxc_estado_factura_normal'), ideSucu],
        );
    }

    private async getVentas(fechaInicio: string, fechaFin: string, ideSucu: number): Promise<AtsVentaDto[]> {
        const query = new SelectQuery(`
            SELECT tide.alterno2_getid, cli.identificac_geper, COUNT(cab.ide_geper) AS numcomprobantes,
                SUM(cab.base_tarifa0_cccfa) AS base_tarifa0, SUM(cab.base_grabada_cccfa) AS base_grabada,
                SUM(cab.base_no_objeto_iva_cccfa) AS base_no_objeto_iva,
                SUM(cab.valor_iva_cccfa) AS valor_iva, SUM(cab.ret_iva_cccfa) AS retiva, SUM(cab.ret_fuente_cccfa) AS retrenta
            FROM cxc_cabece_factura cab
            LEFT JOIN gen_persona cli ON cab.ide_geper = cli.ide_geper
            LEFT JOIN gen_tipo_identifi tide ON cli.ide_getid = tide.ide_getid
            WHERE cab.fecha_emisi_cccfa BETWEEN $1 AND $2
              AND cab.ide_ccefa = $3
              AND cab.ide_sucu = $4
            GROUP BY tide.alterno2_getid, cli.identificac_geper
        `);
        query.addStringParam(1, fechaInicio);
        query.addStringParam(2, fechaFin);
        query.addIntParam(3, this.getVar('p_cxc_estado_factura_normal'));
        query.addIntParam(4, ideSucu);
        const filas = await this.dataSource.createSelectQuery(query);

        const ventas: AtsVentaDto[] = [];
        for (const fila of filas) {
            const cliente = await this.buildClienteVenta(fila.alterno2_getid, fila.identificac_geper);
            ventas.push({
                ...cliente,
                // Hardcoded "18" (limitación heredada del legacy: no usa el tipo real del comprobante).
                tipoComprobante: '18',
                tipoEmision: 'E',
                numeroComprobantes: Number(fila.numcomprobantes ?? 0),
                baseNoGraIva: Number(fila.base_no_objeto_iva ?? 0),
                baseImponible: Number(fila.base_tarifa0 ?? 0),
                baseImpGrav: Number(fila.base_grabada ?? 0),
                montoIva: Number(fila.valor_iva ?? 0),
                montoIce: 0,
                valorRetIva: Number(fila.retiva ?? 0),
                valorRetRenta: Number(fila.retrenta ?? 0),
                formaPago: '20',
            });
        }
        return ventas;
    }

    private async getNotasCreditoVenta(fechaInicio: string, fechaFin: string, ideSucu: number): Promise<AtsVentaDto[]> {
        const query = new SelectQuery(`
            SELECT tide.alterno2_getid, cli.identificac_geper, COUNT(cab.ide_geper) AS numcomprobantes,
                SUM(cab.base_tarifa0_cpcno) AS base_tarifa0, SUM(cab.base_grabada_cpcno) AS base_grabada,
                SUM(cab.base_no_objeto_iva_cpcno) AS base_no_objeto_iva, SUM(cab.valor_iva_cpcno) AS valor_iva
            FROM cxp_cabecera_nota cab
            LEFT JOIN gen_persona cli ON cab.ide_geper = cli.ide_geper
            LEFT JOIN gen_tipo_identifi tide ON cli.ide_getid = tide.ide_getid
            WHERE cab.fecha_emisi_cpcno BETWEEN $1 AND $2
              AND cab.ide_cpeno = $3
              AND cab.ide_sucu = $4
            GROUP BY tide.alterno2_getid, cli.identificac_geper
        `);
        query.addStringParam(1, fechaInicio);
        query.addStringParam(2, fechaFin);
        query.addIntParam(3, IDE_CPENO_NORMAL);
        query.addIntParam(4, ideSucu);
        const filas = await this.dataSource.createSelectQuery(query);

        const notas: AtsVentaDto[] = [];
        for (const fila of filas) {
            const cliente = await this.buildClienteVenta(fila.alterno2_getid, fila.identificac_geper);
            notas.push({
                ...cliente,
                tipoComprobante: '04',
                tipoEmision: 'E',
                numeroComprobantes: Number(fila.numcomprobantes ?? 0),
                baseNoGraIva: Number(fila.base_no_objeto_iva ?? 0),
                baseImponible: Number(fila.base_tarifa0 ?? 0),
                baseImpGrav: Number(fila.base_grabada ?? 0),
                montoIva: Number(fila.valor_iva ?? 0),
                montoIce: 0,
                valorRetIva: 0,
                valorRetRenta: 0,
                // Sin formaPago: paridad legacy, el bloque <formasDePago> está deshabilitado para NC.
            });
        }
        return notas;
    }

    /** Campos de identificación de cliente comunes a ventas y notas de crédito de venta. */
    private async buildClienteVenta(
        tipoIdentificacion: string, identificacion: string,
    ): Promise<Pick<AtsVentaDto, 'tpIdCliente' | 'idCliente' | 'parteRelVtas' | 'tipoCliente' | 'denoCli'>> {
        const base: Pick<AtsVentaDto, 'tpIdCliente' | 'idCliente' | 'parteRelVtas' | 'tipoCliente' | 'denoCli'> = {
            tpIdCliente: tipoIdentificacion ?? '',
            idCliente: identificacion ?? '',
            parteRelVtas: tipoIdentificacion === '07' ? undefined : 'NO',
        };
        if (tipoIdentificacion === '06') { // PASAPORTE
            const query = new SelectQuery(`
                SELECT cli.nom_geper, tcon.alter_tribu_cntco
                FROM gen_persona cli
                LEFT JOIN con_tipo_contribu tcon ON cli.ide_cntco = tcon.ide_cntco
                WHERE cli.identificac_geper = $1
            `);
            query.addStringParam(1, identificacion);
            const persona = await this.dataSource.createSingleQuery(query);
            base.tipoCliente = persona?.alter_tribu_cntco ?? '01';
            base.denoCli = persona?.nom_geper;
        }
        return base;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Anulados
    // ─────────────────────────────────────────────────────────────────────────

    private async getAnuladosFacturas(fechaInicio: string, fechaFin: string, ideSucu: number): Promise<AtsAnuladoDto[]> {
        const query = new SelectQuery(`
            SELECT td.alter_tribu_cntdo, cf.secuencial_cccfa, df.autorizacion_ccdaf,
                SUBSTR(df.serie_ccdaf, 1, 3) AS establecimiento,
                SUBSTR(df.serie_ccdaf, 4, 6) AS puntoemision
            FROM cxc_cabece_factura cf
            INNER JOIN con_tipo_document td ON td.ide_cntdo = cf.ide_cntdo
            INNER JOIN cxc_datos_fac df ON df.ide_ccdaf = cf.ide_ccdaf
            INNER JOIN cxc_estado_factura ef ON ef.ide_ccefa = cf.ide_ccefa
            WHERE ef.ide_ccefa = $1
              AND cf.fecha_emisi_cccfa BETWEEN $2 AND $3
              AND cf.ide_sucu = $4
              AND df.autorizacion_ccdaf IS NOT NULL
            ORDER BY cf.secuencial_cccfa
        `);
        query.addIntParam(1, this.getVar('p_cxc_estado_factura_anulada'));
        query.addStringParam(2, fechaInicio);
        query.addStringParam(3, fechaFin);
        query.addIntParam(4, ideSucu);
        const filas = await this.dataSource.createSelectQuery(query);
        return filas.map((f) => ({
            tipoComprobante: f.alter_tribu_cntdo ?? '',
            establecimiento: f.establecimiento ?? '',
            puntoEmision: f.puntoemision ?? '',
            secuencialInicio: String(Number.parseInt(f.secuencial_cccfa, 10)),
            secuencialFin: String(Number.parseInt(f.secuencial_cccfa, 10)),
            autorizacion: f.autorizacion_ccdaf ?? '',
        }));
    }

    private async getAnuladosRetenciones(fechaInicio: string, fechaFin: string, ideSucu: number): Promise<AtsAnuladoDto[]> {
        const query = new SelectQuery(`
            SELECT autorizacion_cncre, numero_cncre
            FROM con_cabece_retenc
            WHERE ide_cnere = $1
              AND fecha_emisi_cncre BETWEEN $2 AND $3
              AND ide_sucu = $4
              AND es_venta_cncre = FALSE
            ORDER BY numero_cncre
        `);
        query.addIntParam(1, this.getVar('p_con_estado_comprobante_rete_anulado'));
        query.addStringParam(2, fechaInicio);
        query.addStringParam(3, fechaFin);
        query.addIntParam(4, ideSucu);
        const filas = await this.dataSource.createSelectQuery(query);

        const anulados: AtsAnuladoDto[] = [];
        for (const f of filas) {
            const { estab, ptoEmi, secuencial } = this.splitNumero(f.numero_cncre);
            const sec = Number.parseInt(secuencial, 10) || 0;
            if (sec === 0) continue;
            anulados.push({
                tipoComprobante: '07', // Comprobante de Retención
                establecimiento: estab,
                puntoEmision: ptoEmi,
                secuencialInicio: String(sec),
                secuencialFin: String(sec),
                autorizacion: f.autorizacion_cncre ?? '',
            });
        }
        return anulados;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Separa un número de documento en establecimiento/ptoEmisión/secuencial. Soporta tanto el
     * formato con guiones ("001-001-000000001", usado por los comprobantes generados por este
     * sistema) como el formato heredado sin separador (13+ dígitos contiguos, asumido por el ATS
     * del legacy vía substring de ancho fijo 3+3+resto).
     */
    private splitNumero(numero: string | null | undefined): { estab: string; ptoEmi: string; secuencial: string } {
        const limpio = (numero ?? '').trim();
        if (limpio.includes('-')) {
            const partes = limpio.split('-');
            if (partes.length === 3) {
                return { estab: partes[0], ptoEmi: partes[1], secuencial: partes[2] };
            }
        }
        return { estab: limpio.slice(0, 3), ptoEmi: limpio.slice(3, 6), secuencial: limpio.slice(6) };
    }
}
