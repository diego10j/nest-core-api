import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { GptService } from 'src/core/integration/gpt/gpt.service';

import { DocumentosCxPXmlService } from './documentos-cxp-xml.service';
import { GetEnviosSinFacturaDto } from './dto/get-envios-sin-factura.dto';
import { GetFletesConsolidadosDto } from './dto/get-fletes-consolidados.dto';
import {
    DetalleXmlCxP,
    TotalesXmlCxP,
    EmisorXmlCxP,
    ComprobanteXmlCxP,
    CompradorXmlCxP,
    InfoAdicionalXmlCxP,
} from './dto/importar-xml-cxp.dto';
import {
    EnvioFacturaCxPService,
    ArticuloLogistica,
    ProductoPreFactura,
    truncarObservacion,
} from './envio-factura-cxp.service';

/** Envío candidato a incluirse en una factura consolidada de flete (sin factura aún). */
export interface EnvioParaConsolidar {
    ide_cctfa: number;
    cliente: string;
    numero_factura_venta: string;
    fecha_emisi_cccfa: string;
    total_flete_cctfa: number;
}

/** Envío ya emparejado con una línea del XML, listo para el visualizador de confirmación.
 * `valor_matched` incluye IVA (para reflejar el valor real del envío, igual que
 * `total_flete_real_cctfa` en el flujo de un solo envío); `valor_base_matched`/`iva_matched`
 * son la base y el flag de esa misma línea SIN IVA, necesarios para armar un renglón de
 * detalle de factura por envío sin duplicar el cálculo del impuesto. */
export interface EnvioConsolidadoMatch extends EnvioParaConsolidar {
    valor_matched: number;
    valor_base_matched: number;
    iva_matched: 'SI' | 'NO';
    observacion_matched: string;
}

export interface PrefillFacturaFleteConsolidada {
    ide_geper: number;
    nom_geper: string;
    identificac_geper: string;
    ide_cntdo: number;
    numero_cpcfa: string;
    autorizacio_cpcfa: string;
    fecha_emisi_cpcfa: string;
    ide_cndfp: number;
    ide_cndfp1: number;
    ide_srtst: number;
    /** Artículo fijo de servicios logísticos con el que se factura cada envío (mismo para
     * las N líneas de detalle, una por envío). */
    articulo: ArticuloLogistica;
    descuento_cpcfa: number;
    /** Total de la factura del XML (base + IVA), para mostrar en el visualizador. */
    total_cpcfa: number;
    /** Un renglón por envío seleccionado, con el emparejamiento propuesto, para el visualizador. */
    envios: EnvioConsolidadoMatch[];
    /** Solo con 1 envío: líneas ya agrupadas por IVA (igual que el flujo viejo de 1 envío,
     * `EnvioFacturaCxPService.buildProductos`), para guardar la factura sin perder el desglose
     * si el XML trae más de una línea para este único envío. Con 2+ envíos no se usa (ahí
     * cada línea de detalle sale 1 a 1 de `envios`, ver crearFacturaFleteConsolidada). */
    productos?: ProductoPreFactura[];
    /** Aviso no bloqueante: con 1 solo envío no se exige que el XML traiga exactamente 1 línea
     * (no hay ambigüedad posible con un único envío candidato) - si trae más de una, se avisa
     * pero se continúa igual, agrupando todo contra ese envío. */
    advertencia?: string;
    /** Data cruda del XML tal cual viene en el comprobante, solo para el RIDE (vista previa) -
     * no se usa para armar/guardar la factura (eso sigue viniendo de los campos de arriba,
     * ya resueltos contra la BD). */
    preview: {
        emisor: EmisorXmlCxP;
        comprobante: ComprobanteXmlCxP;
        comprador: CompradorXmlCxP;
        detalles: DetalleXmlCxP[];
        totales: TotalesXmlCxP;
        infoAdicional: InfoAdicionalXmlCxP[];
    };
}

/**
 * Consultas del flujo "Factura Consolidada de Flete": buscar envíos sin factura de un
 * transportista para agrupar, parsear+emparejar el XML consolidado del transportista contra
 * esos envíos, y listar/consultar el estado de los procesos ya iniciados
 * (cxp_cab_flete_cons/cxp_det_flete_cons). El guardado vive en FleteConsolidadoSaveService.
 */
@Injectable()
export class FleteConsolidadoService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly xmlService: DocumentosCxPXmlService,
        private readonly envioFacturaCxPService: EnvioFacturaCxPService,
        private readonly gptService: GptService,
    ) { }

    /** Envíos de un transportista sin factura de flete registrada, en un rango de fechas
     * (misma fecha de referencia que el Reporte de Envío de Facturas: emisión de la factura
     * de venta). Alimenta la selección múltiple del wizard. */
    async getEnviosSinFacturaPorProveedor(dtoIn: GetEnviosSinFacturaDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                e.ide_cctfa,
                b.nom_geper AS cliente,
                df.establecimiento_ccdfa || '-' || df.pto_emision_ccdfa || '-' || f.secuencial_cccfa
                    AS numero_factura_venta,
                f.fecha_emisi_cccfa,
                e.total_flete_cctfa
            FROM cxc_transporte_factura e
            INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN cxc_datos_fac df     ON f.ide_ccdaf = df.ide_ccdaf
            INNER JOIN gen_persona b        ON f.ide_geper = b.ide_geper
            WHERE e.ide_vgtra = $1
              AND e.ide_cpcfa IS NULL
              AND f.fecha_emisi_cccfa BETWEEN $2 AND $3
              AND e.ide_empr = $4
              AND e.ide_sucu = $5
            ORDER BY f.fecha_emisi_cccfa
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ide_vgtra);
        query.addStringParam(2, dtoIn.fechaInicio);
        query.addStringParam(3, dtoIn.fechaFin);
        query.addIntParam(4, dtoIn.ideEmpr);
        query.addIntParam(5, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    async prepararFacturaFleteConsolidadaDesdeXml(
        ideCctfas: number[],
        fileBuffer: Buffer,
        dtoIn: HeaderParamsDto,
    ): Promise<PrefillFacturaFleteConsolidada> {
        const envios = await this.getEnviosParaFacturar(ideCctfas, dtoIn);
        if (envios.length !== ideCctfas.length) {
            const faltantes = ideCctfas.filter((id) => !envios.some((e) => e.ide_cctfa === id));
            throw new BadRequestException(
                `Los siguientes envíos no existen o ya tienen factura registrada: ${faltantes.join(', ')}`,
            );
        }

        const ideVgtraSet = new Set(envios.map((e) => e.ide_vgtra));
        if (ideVgtraSet.size > 1) {
            throw new BadRequestException(
                'Los envíos seleccionados pertenecen a distintos transportistas: deben ser del mismo proveedor.',
            );
        }
        const [{ ide_vgtra: ideVgtra, ide_geper_transporte: ideGeperTransporte, nombre_vgtra: nombreVgtra }] = envios;
        if (!ideVgtra || !ideGeperTransporte) {
            throw new BadRequestException(
                'Los envíos seleccionados no tienen una empresa de transporte asignada.',
            );
        }

        const parsed = await this.xmlService.parseFacturaXml(fileBuffer, dtoIn);

        if (Number(parsed.ide_geper) !== Number(ideGeperTransporte)) {
            throw new BadRequestException(
                `La factura del XML pertenece a "${parsed.nom_geper}", pero el transportista de los envíos seleccionados es "${nombreVgtra}".`,
            );
        }

        // Con 2+ envíos no hay forma de saber a cuál pertenece cada línea sin que coincidan
        // en cantidad (se resuelve el emparejamiento por GPT más abajo). Con 1 solo envío no
        // existe esa ambigüedad - todo el XML es de ese envío, sin importar cuántas líneas
        // traiga - así que esta validación estricta no aplica a ese caso (ver más abajo).
        if (envios.length > 1 && parsed.detalles.length !== envios.length) {
            throw new BadRequestException(
                `El XML trae ${parsed.detalles.length} línea(s) de detalle, pero seleccionaste ${envios.length} envío(s). Deben coincidir 1 a 1.`,
            );
        }

        const articulo = await this.envioFacturaCxPService.getArticuloLogisticaDefault();

        const [ideCndfp, ideCndfp1, ideSrtst] = await Promise.all([
            this.envioFacturaCxPService.resolverFormaPago(parsed.ide_cndfp),
            this.envioFacturaCxPService.resolverDiasCredito(parsed.ide_cndfp1),
            this.envioFacturaCxPService.resolverSustentoTributario(),
        ]);

        const prefillBase = {
            ide_geper: parsed.ide_geper,
            nom_geper: parsed.nom_geper,
            identificac_geper: parsed.identificac_geper,
            ide_cntdo: parsed.ide_cntdo,
            numero_cpcfa: parsed.numero_cpcfa,
            autorizacio_cpcfa: parsed.autorizacio_cpcfa,
            fecha_emisi_cpcfa: parsed.fecha_emisi_cpcfa,
            ide_cndfp: ideCndfp,
            ide_cndfp1: ideCndfp1,
            ide_srtst: ideSrtst,
            articulo,
            descuento_cpcfa: parsed.totales.descuento,
            total_cpcfa: parsed.totales.total,
            preview: {
                emisor: parsed.emisor,
                comprobante: parsed.comprobante,
                comprador: parsed.comprador,
                detalles: parsed.detalles,
                totales: parsed.totales,
                infoAdicional: parsed.infoAdicional,
            },
        };

        if (envios.length === 1) {
            // Sin ambigüedad posible (un solo envío candidato): se agrupa el XML completo por
            // IVA, igual que hacía el flujo viejo de un solo envío (EnvioFacturaCxPService.
            // buildProductos), en vez de exigir 1 línea = 1 envío.
            const envio = envios[0];
            const productos = this.envioFacturaCxPService.buildProductos(parsed, articulo);
            const advertencia = parsed.detalles.length !== 1
                ? `El XML trae ${parsed.detalles.length} línea(s) de detalle para este envío; se registran todas contra él.`
                : undefined;
            const enviosConMatch: EnvioConsolidadoMatch[] = [{
                ide_cctfa: envio.ide_cctfa,
                cliente: envio.cliente,
                numero_factura_venta: envio.numero_factura_venta,
                fecha_emisi_cccfa: envio.fecha_emisi_cccfa,
                total_flete_cctfa: envio.total_flete_cctfa,
                valor_matched: parsed.totales.total,
                valor_base_matched: parsed.totales.base_grabada + parsed.totales.base_tarifa0
                    + parsed.totales.base_no_objeto_iva,
                iva_matched: parsed.totales.base_grabada > 0 ? 'SI' : 'NO',
                observacion_matched: truncarObservacion(
                    parsed.detalles.map((d) => d.observacion_cpdfa).filter(Boolean).join(', '),
                ),
            }];
            return { ...prefillBase, productos, advertencia, envios: enviosConMatch };
        }

        const matches = await this.emparejarConGpt(
            parsed.detalles.map((d, index) => ({
                index,
                observacion: d.observacion_cpdfa,
                valor: d.valor_cpdfa,
            })),
            envios,
        );

        // valor_matched incluye IVA cuando la línea grava (parsed.totales.tarifa_iva) - así
        // representa el "valor real" completo del envío, mismo criterio que
        // total_flete_real_cctfa en el flujo de un solo envío (totales.total, no la base).
        // valor_base_matched/iva_matched son la base y el flag SIN IVA de esa misma línea, para
        // poder armar un renglón de detalle de factura por envío (ver crearFacturaFleteConsolidada
        // en el frontend) sin volver a aplicar el IVA sobre un valor que ya lo incluye.
        const tarifaIva = parsed.totales.tarifa_iva;
        const enviosConMatch: EnvioConsolidadoMatch[] = envios.map((envio) => {
            const match = matches.find((m) => m.ide_cctfa === envio.ide_cctfa);
            const linea = match ? parsed.detalles[match.indexLinea] : undefined;
            const ivaMatched: 'SI' | 'NO' = linea?.iva_inarti_cpdfa === '1' ? 'SI' : 'NO';
            const valorBase = linea ? Number(linea.valor_cpdfa.toFixed(2)) : 0;
            const valorConIva = linea
                ? Number((linea.valor_cpdfa * (ivaMatched === 'SI' ? 1 + tarifaIva : 1)).toFixed(2))
                : 0;
            return {
                ide_cctfa: envio.ide_cctfa,
                cliente: envio.cliente,
                numero_factura_venta: envio.numero_factura_venta,
                fecha_emisi_cccfa: envio.fecha_emisi_cccfa,
                total_flete_cctfa: envio.total_flete_cctfa,
                valor_matched: valorConIva,
                valor_base_matched: valorBase,
                iva_matched: ivaMatched,
                observacion_matched: linea?.observacion_cpdfa ?? '',
            };
        });

        return { ...prefillBase, envios: enviosConMatch };
    }

    async getFletesConsolidados(dtoIn: GetFletesConsolidadosDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
            SELECT
                cc.ide_cpcfc,
                cc.ide_cpefc,
                ec.nombre_cpefc AS estado,
                ec.color_cpefc AS color_estado,
                cc.ide_geper,
                p.nom_geper AS proveedor,
                cc.fecha_desde_cpcfc,
                cc.fecha_hasta_cpcfc,
                cc.ide_cpcfa,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                (SELECT COUNT(*) FROM cxp_det_flete_cons d WHERE d.ide_cpcfc = cc.ide_cpcfc) AS num_envios,
                (
                    -- Con 1 solo envío el ide_cpdfa vinculado puede ser solo una de varias
                    -- líneas agrupadas por IVA (no toda la factura) - ahí se compara contra el
                    -- total de la factura (cf.total_cpcfa) en vez de esa línea puntual. Con 2+
                    -- envíos cada línea sí es 1 a 1, se compara normal.
                    SELECT CASE
                        WHEN COUNT(*) = 1 THEN
                            CASE WHEN MAX(e.total_flete_cctfa) != cf.total_cpcfa
                                 THEN ABS(MAX(e.total_flete_cctfa) - cf.total_cpcfa) ELSE 0 END
                        ELSE
                            COALESCE(SUM(ABS(e.total_flete_cctfa - cd.valor_cpdfa))
                                     FILTER (WHERE e.total_flete_cctfa != cd.valor_cpdfa), 0)
                    END
                    FROM cxp_det_flete_cons d
                    INNER JOIN cxp_detall_factur cd     ON d.ide_cpdfa = cd.ide_cpdfa
                    INNER JOIN cxc_transporte_factura e ON d.ide_cctfa = e.ide_cctfa
                    WHERE d.ide_cpcfc = cc.ide_cpcfc
                ) AS diferencia_total,
                cc.hora_ingre
            FROM cxp_cab_flete_cons cc
            INNER JOIN cxp_estado_flete_cons ec ON cc.ide_cpefc = ec.ide_cpefc
            INNER JOIN gen_persona p            ON cc.ide_geper = p.ide_geper
            INNER JOIN cxp_cabece_factur cf     ON cc.ide_cpcfa = cf.ide_cpcfa
            WHERE cc.ide_empr = $1
              AND cc.ide_sucu = $2
              AND cc.activo_cpcfc = true
            ORDER BY cc.hora_ingre DESC
            `,
            dtoIn,
        );
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    async getFleteConsolidadoById(ideCpcfc: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                cc.ide_cpcfc,
                cc.ide_cpefc,
                ec.nombre_cpefc AS estado,
                ec.color_cpefc AS color_estado,
                cc.ide_geper,
                p.nom_geper AS proveedor,
                p.identificac_geper,
                t.logo_vgtra AS logo_transportista,
                cc.fecha_desde_cpcfc,
                cc.fecha_hasta_cpcfc,
                cc.ide_cpcfa,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                cf.pagado_cpcfa,
                cf.ide_cnccc,
                ccc.numero_cnccc,
                cc.ide_teclb
            FROM cxp_cab_flete_cons cc
            INNER JOIN cxp_estado_flete_cons ec ON cc.ide_cpefc = ec.ide_cpefc
            INNER JOIN gen_persona p            ON cc.ide_geper = p.ide_geper
            -- El logo se resuelve por ide_vgtra (PK real de ven_transporte, igual que en
            -- getEnviosParaFacturar/facturas.service.ts), NO por ide_geper: ven_transporte.ide_geper
            -- no está garantizado poblado para todo transportista, a diferencia de ide_vgtra que
            -- ya viene enlazado desde el envío (cxc_transporte_factura) que originó este proceso.
            LEFT JOIN LATERAL (
                SELECT d.ide_cctfa
                FROM cxp_det_flete_cons d
                WHERE d.ide_cpcfc = cc.ide_cpcfc
                LIMIT 1
            ) pe ON TRUE
            LEFT JOIN cxc_transporte_factura ctf ON ctf.ide_cctfa = pe.ide_cctfa
            LEFT JOIN ven_transporte t          ON t.ide_vgtra = ctf.ide_vgtra
            INNER JOIN cxp_cabece_factur cf     ON cc.ide_cpcfa = cf.ide_cpcfa
            LEFT JOIN con_cab_comp_cont ccc     ON ccc.ide_cnccc = cf.ide_cnccc
            WHERE cc.ide_cpcfc = $1
              AND cc.ide_empr = $2
              AND cc.ide_sucu = $3
        `);
        qCab.addIntParam(1, ideCpcfc);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) {
            throw new BadRequestException(`Factura consolidada ide_cpcfc=${ideCpcfc} no encontrada.`);
        }

        const qDet = new SelectQuery(`
            SELECT
                d.ide_cpdfc,
                d.ide_cctfa,
                cd.valor_cpdfa       AS valor_cpdfc,
                cd.observacion_cpdfa AS observacion_cpdfc,
                e.total_flete_cctfa,
                b.nom_geper AS cliente,
                df.establecimiento_ccdfa || '-' || df.pto_emision_ccdfa || '-' || f.secuencial_cccfa
                    AS numero_factura_venta,
                CASE
                    WHEN e.total_flete_cctfa != cd.valor_cpdfa
                    THEN ABS(e.total_flete_cctfa - cd.valor_cpdfa)
                    ELSE NULL
                END AS diferencia_flete,
                CASE
                    WHEN e.total_flete_cctfa > cd.valor_cpdfa THEN 'Cobro más'
                    WHEN e.total_flete_cctfa < cd.valor_cpdfa THEN 'Cobro menos'
                    ELSE NULL
                END AS tipo_diferencia_flete
            FROM cxp_det_flete_cons d
            INNER JOIN cxp_detall_factur cd      ON d.ide_cpdfa = cd.ide_cpdfa
            INNER JOIN cxc_transporte_factura e  ON d.ide_cctfa = e.ide_cctfa
            INNER JOIN cxc_cabece_factura f      ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN cxc_datos_fac df          ON f.ide_ccdaf = df.ide_ccdaf
            INNER JOIN gen_persona b             ON f.ide_geper = b.ide_geper
            WHERE d.ide_cpcfc = $1
            ORDER BY d.ide_cpdfc
        `);
        qDet.addIntParam(1, ideCpcfc);
        const envios = await this.dataSource.createSelectQuery(qDet);

        // Con 1 solo envío el ide_cpdfa vinculado puede ser solo una de varias líneas
        // agrupadas por IVA (no toda la factura) - ahí "facturado" es el total de la factura,
        // no esa línea puntual. Con 2+ envíos cada línea sí es 1 a 1, se deja tal cual.
        if (envios.length === 1) {
            const totalFactura = Number(cabecera.total_cpcfa);
            const cobrado = Number(envios[0].total_flete_cctfa);
            envios[0].valor_cpdfc = totalFactura;
            envios[0].diferencia_flete = cobrado !== totalFactura ? Math.abs(cobrado - totalFactura) : null;
            envios[0].tipo_diferencia_flete =
                cobrado > totalFactura ? 'Cobro más' : cobrado < totalFactura ? 'Cobro menos' : null;
        }

        return { ...cabecera, envios };
    }

    /** Envíos candidatos (sin factura) por sus ide_cctfa, con los datos del transportista para
     * validar que todos compartan el mismo (ide_vgtra/ide_geper_transporte). */
    private async getEnviosParaFacturar(
        ideCctfas: number[],
        dtoIn: HeaderParamsDto,
    ): Promise<(EnvioParaConsolidar & { ide_vgtra: number | null; ide_geper_transporte: number | null; nombre_vgtra: string | null })[]> {
        const query = new SelectQuery(`
            SELECT
                e.ide_cctfa,
                e.ide_vgtra,
                t.ide_geper AS ide_geper_transporte,
                t.nombre_vgtra,
                b.nom_geper AS cliente,
                df.establecimiento_ccdfa || '-' || df.pto_emision_ccdfa || '-' || f.secuencial_cccfa
                    AS numero_factura_venta,
                f.fecha_emisi_cccfa,
                e.total_flete_cctfa
            FROM cxc_transporte_factura e
            INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN cxc_datos_fac df     ON f.ide_ccdaf = df.ide_ccdaf
            INNER JOIN gen_persona b        ON f.ide_geper = b.ide_geper
            LEFT JOIN ven_transporte t      ON e.ide_vgtra = t.ide_vgtra
            WHERE e.ide_cctfa = ANY($1)
              AND e.ide_cpcfa IS NULL
              AND e.ide_empr = $2
              AND e.ide_sucu = $3
        `);
        query.addParam(1, ideCctfas);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Empareja cada línea del XML con el envío que le corresponde usando GPT (response_format
     * json_object, mismo patrón que TesoreriaService.corregirParseo). Si GPT deja alguna línea
     * o envío sin emparejar (o repite uno), completa lo que falte con un fallback posicional
     * simple - el usuario igual revisa y puede reasignar a mano en el visualizador, así que
     * nunca se bloquea el flujo por un match incompleto.
     */
    private async emparejarConGpt(
        lineas: { index: number; observacion: string; valor: number }[],
        envios: EnvioParaConsolidar[],
    ): Promise<{ indexLinea: number; ide_cctfa: number }[]> {
        const prompt = `Eres un asistente contable. Te doy dos listas en JSON: "lineas" son las
líneas de detalle de una factura de un transportista (cada una con su índice, una observación de
texto libre y un valor en dólares), y "envios" son los envíos de mercancía que esa factura podría
estar cobrando (cada uno con su cliente, el número de su factura de venta, la fecha, y el valor de
flete que se le cobró originalmente al cliente). Empareja cada línea con el envío que más
probablemente le corresponde: usa como pista principal la cercanía del valor, y como pista
secundaria cualquier referencia de texto en la observación (número de factura, guía, nombre de
cliente) que coincida con un envío. Cada línea debe emparejarse con un envío distinto (no
repitas envíos). Responde SOLO un JSON con la forma exacta:
{"matches": [{"indexLinea": number, "ide_cctfa": number}]}`;

        let matches: { indexLinea: number; ide_cctfa: number }[] = [];
        try {
            const respuesta = await this.gptService.parseTextToJson(
                prompt,
                JSON.stringify({ lineas, envios }),
            );
            if (Array.isArray(respuesta?.matches)) {
                matches = respuesta.matches
                    .filter((m: any) => Number.isFinite(Number(m?.indexLinea)) && Number.isFinite(Number(m?.ide_cctfa)))
                    .map((m: any) => ({ indexLinea: Number(m.indexLinea), ide_cctfa: Number(m.ide_cctfa) }));
            }
        } catch {
            // GPT no disponible o respuesta inválida: se completa todo por el fallback posicional de abajo.
        }

        // Descarta matches que repitan línea o envío (se completan por el fallback).
        const indicesUsados = new Set<number>();
        const enviosUsados = new Set<number>();
        matches = matches.filter((m) => {
            const valido =
                lineas.some((l) => l.index === m.indexLinea) &&
                envios.some((e) => e.ide_cctfa === m.ide_cctfa) &&
                !indicesUsados.has(m.indexLinea) &&
                !enviosUsados.has(m.ide_cctfa);
            if (valido) {
                indicesUsados.add(m.indexLinea);
                enviosUsados.add(m.ide_cctfa);
            }
            return valido;
        });

        const lineasSinAsignar = lineas.filter((l) => !indicesUsados.has(l.index));
        const enviosSinAsignar = envios.filter((e) => !enviosUsados.has(e.ide_cctfa));
        lineasSinAsignar.forEach((linea, i) => {
            if (enviosSinAsignar[i]) {
                matches.push({ indexLinea: linea.index, ide_cctfa: enviosSinAsignar[i].ide_cctfa });
            }
        });

        return matches;
    }
}
