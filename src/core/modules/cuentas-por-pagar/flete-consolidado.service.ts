import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { GptService } from 'src/core/integration/gpt/gpt.service';

import { DocumentosCxPXmlService } from './documentos-cxp-xml.service';
import { GetEnviosSinFacturaDto } from './dto/get-envios-sin-factura.dto';
import { GetFletesConsolidadosDto } from './dto/get-fletes-consolidados.dto';
import { EnvioFacturaCxPService, ProductoPreFactura } from './envio-factura-cxp.service';

/** Envío candidato a incluirse en una factura consolidada de flete (sin factura aún). */
export interface EnvioParaConsolidar {
    ide_cctfa: number;
    cliente: string;
    numero_factura_venta: string;
    fecha_emisi_cccfa: string;
    total_flete_cctfa: number;
}

/** Envío ya emparejado con una línea del XML, listo para el visualizador de confirmación. */
export interface EnvioConsolidadoMatch extends EnvioParaConsolidar {
    valor_matched: number;
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
    /** Líneas ya agrupadas por IVA (≤2), listas para guardar la factura - mismo criterio que
     * el flujo de un solo envío (EnvioFacturaCxPService.buildProductos). */
    productos: ProductoPreFactura[];
    descuento_cpcfa: number;
    /** Un renglón por envío seleccionado, con el emparejamiento propuesto, para el visualizador. */
    envios: EnvioConsolidadoMatch[];
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

        if (parsed.detalles.length !== envios.length) {
            throw new BadRequestException(
                `El XML trae ${parsed.detalles.length} línea(s) de detalle, pero seleccionaste ${envios.length} envío(s). Deben coincidir 1 a 1.`,
            );
        }

        const articulo = await this.envioFacturaCxPService.getArticuloLogisticaDefault();
        const productos = this.envioFacturaCxPService.buildProductos(parsed, articulo);

        const [ideCndfp, ideCndfp1, ideSrtst] = await Promise.all([
            this.envioFacturaCxPService.resolverFormaPago(parsed.ide_cndfp),
            this.envioFacturaCxPService.resolverDiasCredito(parsed.ide_cndfp1),
            this.envioFacturaCxPService.resolverSustentoTributario(),
        ]);

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
        const tarifaIva = parsed.totales.tarifa_iva;
        const enviosConMatch: EnvioConsolidadoMatch[] = envios.map((envio) => {
            const match = matches.find((m) => m.ide_cctfa === envio.ide_cctfa);
            const linea = match ? parsed.detalles[match.indexLinea] : undefined;
            const valorConIva = linea
                ? Number((linea.valor_cpdfa * (linea.iva_inarti_cpdfa === '1' ? 1 + tarifaIva : 1)).toFixed(2))
                : 0;
            return {
                ide_cctfa: envio.ide_cctfa,
                cliente: envio.cliente,
                numero_factura_venta: envio.numero_factura_venta,
                fecha_emisi_cccfa: envio.fecha_emisi_cccfa,
                total_flete_cctfa: envio.total_flete_cctfa,
                valor_matched: valorConIva,
                observacion_matched: linea?.observacion_cpdfa ?? '',
            };
        });

        return {
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
            productos,
            descuento_cpcfa: parsed.totales.descuento,
            envios: enviosConMatch,
        };
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
                cc.fecha_desde_cpcfc,
                cc.fecha_hasta_cpcfc,
                cc.ide_cpcfa,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                cf.pagado_cpcfa,
                cc.ide_teclb
            FROM cxp_cab_flete_cons cc
            INNER JOIN cxp_estado_flete_cons ec ON cc.ide_cpefc = ec.ide_cpefc
            INNER JOIN gen_persona p            ON cc.ide_geper = p.ide_geper
            INNER JOIN cxp_cabece_factur cf     ON cc.ide_cpcfa = cf.ide_cpcfa
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
                d.valor_cpdfc,
                d.observacion_cpdfc,
                b.nom_geper AS cliente,
                df.establecimiento_ccdfa || '-' || df.pto_emision_ccdfa || '-' || f.secuencial_cccfa
                    AS numero_factura_venta
            FROM cxp_det_flete_cons d
            INNER JOIN cxc_transporte_factura e ON d.ide_cctfa = e.ide_cctfa
            INNER JOIN cxc_cabece_factura f      ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN cxc_datos_fac df          ON f.ide_ccdaf = df.ide_ccdaf
            INNER JOIN gen_persona b             ON f.ide_geper = b.ide_geper
            WHERE d.ide_cpcfc = $1
            ORDER BY d.ide_cpdfc
        `);
        qDet.addIntParam(1, ideCpcfc);
        const envios = await this.dataSource.createSelectQuery(qDet);

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
