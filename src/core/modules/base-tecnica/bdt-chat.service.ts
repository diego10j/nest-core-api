import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { BdtIaService } from './bdt-ia.service';
import {
  BDT_CONFIG,
  ESTADOS_FUENTE_CHAT,
  ETIQUETA_TIPO_DOCUMENTO,
  MENSAJE_IA_GENERAL,
} from './constants/base-tecnica.constants';
import { BuscarProductosBdtDto } from './dto/buscar-productos-bdt.dto';
import { CalificarConsultaDto } from './dto/calificar-consulta.dto';
import { ChatBaseTecnicaDto } from './dto/chat-base-tecnica.dto';
import {
  EntradaIndiceProducto,
  detectarProductos,
  elegirProductoDetectado,
} from './helpers/detector-producto.helper';
import { normalizarTexto } from './helpers/normalizar.helper';
import {
  RespuestaChatDocumentos,
  SCHEMA_RESPUESTA_CHAT,
  buildPromptChatDocumentos,
  buildPromptIaGeneral,
} from './prompts/chat.prompt';

/** Eventos NDJSON que recibe el chat flotante del frontend. */
export type EventoChat =
  | { tipo: 'producto'; ide_inarti: number; nombre: string }
  | { tipo: 'seleccion'; opciones: ProductoCandidato[] }
  | { tipo: 'sugerir_cambio'; producto: ProductoCandidato }
  | { tipo: 'delta'; texto: string }
  | { tipo: 'citas'; citas: CitaChat[] }
  | { tipo: 'sin_respuesta' }
  | { tipo: 'sin_producto' }
  | { tipo: 'aviso_ia' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin'; modo: string; ide_bdcon: number | null };

export interface ProductoCandidato {
  ide_inarti: number;
  nombre: string;
  coincidencia: string;
  cobertura: number;
  similitud: number;
  documentos: number;
}

export interface CitaChat {
  ide_bddoc: number;
  archivo: string;
  uuid: string;
  extension: string;
  tipo: string;
  tipo_etiqueta: string;
  pagina: number | null;
  seccion: string | null;
  referencia: string;
}

interface DocContexto {
  etiqueta: string;
  ide_bddoc: number;
  tipo_bddoc: string;
  nombre_original_bddoc: string;
  uuid_origen_bddoc: string;
  estado_bddoc: string;
  fecha_referencia_bddoc: string | null;
}

type Emitir = (evento: EventoChat) => void;

/**
 * Chat técnico QuimIA. REGLA: solo lee tablas bdt_* (ni inv_articulo ni inv_lote ni ninguna otra
 * del ERP). El nombre del producto sale de bdt_producto.nombre_bdprd (copiado al procesar).
 */
@Injectable()
export class BdtChatService {
  private readonly logger = new Logger(BdtChatService.name);
  private cacheIndice = new Map<number, { expira: number; data: EntradaIndiceProducto[] }>();

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly ia: BdtIaService,
  ) {}

  async responder(dto: ChatBaseTecnicaDto & HeaderParamsDto, emitir: Emitir): Promise<void> {
    try {
      if (dto.modo === 'IA_GENERAL') {
        await this.responderIaGeneral(dto, emitir);
        return;
      }
      await this.responderDocumentos(dto, emitir);
    } catch (error) {
      this.logger.error(`Chat: ${error?.message}`, error?.stack);
      emitir({ tipo: 'error', mensaje: 'No se pudo procesar la consulta. Intenta nuevamente.' });
      emitir({ tipo: 'fin', modo: dto.modo ?? 'DOCUMENTOS', ide_bdcon: null });
    }
  }

  // ------------------------------------------------------------------ modo documentos

  private async responderDocumentos(dto: ChatBaseTecnicaDto & HeaderParamsDto, emitir: Emitir) {
    const candidatos = await this.buscarCandidatos(dto.pregunta, dto.ideEmpr);
    let producto = dto.ide_inarti ? await this.getProductoBdt(dto.ide_inarti, dto.ideEmpr) : null;

    if (producto) {
      // La pregunta nombra claramente OTRO producto: se propone el cambio y no se responde con el
      // producto activo (la respuesta sería sobre el producto equivocado).
      const eleccion = elegirProductoDetectado(candidatos);
      const activoMencionado = candidatos.some((c) => c.ide_inarti === producto.ide_inarti);
      if (!activoMencionado && eleccion.tipo === 'uno') {
        const texto = `Tu pregunta parece ser sobre **${eleccion.producto.nombre}**, no sobre **${producto.nombre}**. ¿Cambio de producto?`;
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'sugerir_cambio', producto: eleccion.producto });
        const ide = await this.registrarConsulta(dto, { modo: 'SELECCION', ideInarti: producto.ide_inarti, respuesta: texto });
        emitir({ tipo: 'fin', modo: 'SELECCION', ide_bdcon: ide });
        return;
      }
      if (!activoMencionado && eleccion.tipo === 'varios') {
        const texto = `Tu pregunta menciona otros productos. ¿A cuál te refieres? (o sigue con **${producto.nombre}**)`;
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'seleccion', opciones: eleccion.opciones });
        const ide = await this.registrarConsulta(dto, { modo: 'SELECCION', ideInarti: producto.ide_inarti, respuesta: texto });
        emitir({ tipo: 'fin', modo: 'SELECCION', ide_bdcon: ide });
        return;
      }
    } else {
      const eleccion = elegirProductoDetectado(candidatos);
      if (eleccion.tipo === 'ninguno') {
        const texto =
          '🔎 No encontré un producto con información técnica cargada que coincida con tu pregunta. ' +
          'Escribe el nombre del producto (por ejemplo, *"pureza del ácido cítrico anhidro"*) o elige uno con **Cambiar producto**.';
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'sin_producto' });
        const ide = await this.registrarConsulta(dto, { modo: 'SELECCION', sinDato: true, respuesta: texto });
        emitir({ tipo: 'fin', modo: 'SELECCION', ide_bdcon: ide });
        return;
      }
      if (eleccion.tipo === 'varios') {
        const texto = `Encontré **${eleccion.opciones.length} productos** que coinciden. ¿A cuál te refieres?`;
        emitir({ tipo: 'delta', texto });
        emitir({ tipo: 'seleccion', opciones: eleccion.opciones });
        const ide = await this.registrarConsulta(dto, { modo: 'SELECCION', respuesta: texto });
        emitir({ tipo: 'fin', modo: 'SELECCION', ide_bdcon: ide });
        return;
      }
      producto = { ide_inarti: eleccion.producto.ide_inarti, nombre: eleccion.producto.nombre };
    }

    emitir({ tipo: 'producto', ide_inarti: producto.ide_inarti, nombre: producto.nombre });

    const contexto = await this.construirContexto(producto.ide_inarti, dto.ideEmpr, dto.pregunta, producto.nombre);
    if (!contexto.docs.length) {
      const texto = `No hay documentos técnicos procesados para **${producto.nombre}**. Procésalos desde el tab *Archivos* del producto.`;
      emitir({ tipo: 'delta', texto });
      emitir({ tipo: 'sin_respuesta' });
      const ide = await this.registrarConsulta(dto, {
        modo: 'DOCUMENTOS',
        ideInarti: producto.ide_inarti,
        sinDato: true,
        respuesta: texto,
      });
      emitir({ tipo: 'fin', modo: 'DOCUMENTOS', ide_bdcon: ide });
      return;
    }

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: buildPromptChatDocumentos(producto.nombre, contexto.texto, new Date().toISOString().slice(0, 10)),
      },
      ...this.historialReciente(dto),
      { role: 'user', content: dto.pregunta },
    ];
    const r = await this.ia.completarJson<RespuestaChatDocumentos>(messages, SCHEMA_RESPUESTA_CHAT, 'respuesta_chat_tecnico');

    // Solo se aceptan citas a documentos que realmente se enviaron en el contexto.
    const citas = this.resolverCitas(r.datos.citas ?? [], contexto.docs);
    const encontrado = r.datos.encontrado && !!r.datos.respuesta?.trim();

    let texto: string;
    if (encontrado) {
      texto = r.datos.respuesta.trim();
    } else {
      const relacionado = r.datos.respuesta?.trim();
      texto =
        `No encontré esa información en los documentos cargados de **${producto.nombre}**.` +
        (relacionado ? `\n\n${relacionado}` : '') +
        '\n\n¿Quieres que responda QuimIA con conocimiento técnico general (generado con IA)?';
    }

    emitir({ tipo: 'delta', texto });
    if (citas.length) emitir({ tipo: 'citas', citas });
    if (!encontrado) emitir({ tipo: 'sin_respuesta' });

    const ide = await this.registrarConsulta(dto, {
      modo: 'DOCUMENTOS',
      ideInarti: producto.ide_inarti,
      respuesta: texto,
      sinDato: !encontrado,
      documentos: citas.map((c) => c.ide_bddoc),
      citas,
      modelo: r.modelo,
      tokensEntrada: r.tokensEntrada,
      tokensSalida: r.tokensSalida,
    });
    emitir({ tipo: 'fin', modo: 'DOCUMENTOS', ide_bdcon: ide });
  }

  // ------------------------------------------------------------------ modo IA general

  private async responderIaGeneral(dto: ChatBaseTecnicaDto & HeaderParamsDto, emitir: Emitir) {
    const producto = dto.ide_inarti ? await this.getProductoBdt(dto.ide_inarti, dto.ideEmpr) : null;
    let identificacion: string | null = null;
    if (producto) {
      const r = await this.dataSource.pool.query(
        `SELECT STRING_AGG(DISTINCT CONCAT_WS(' · ', NULLIF('CAS ' || cas_bdpfa, 'CAS '), nombre_comercial_bdpfa, grado_bdpfa), '; ') AS ident
           FROM bdt_producto_fabricante WHERE ide_inarti = $1 AND ide_empr = $2`,
        [producto.ide_inarti, dto.ideEmpr],
      );
      identificacion = r.rows[0]?.ident || null;
      emitir({ tipo: 'producto', ide_inarti: producto.ide_inarti, nombre: producto.nombre });
    }

    emitir({ tipo: 'aviso_ia' });
    const stream = await this.ia.completarStream([
      { role: 'system', content: buildPromptIaGeneral(producto?.nombre ?? null, identificacion) },
      ...this.historialReciente(dto),
      { role: 'user', content: dto.pregunta },
    ]);

    let texto = '';
    let tokensEntrada = 0;
    let tokensSalida = 0;
    for await (const chunk of stream) {
      const pieza = chunk.choices[0]?.delta?.content || '';
      if (pieza) {
        texto += pieza;
        emitir({ tipo: 'delta', texto: pieza });
      }
      if (chunk.usage) {
        tokensEntrada = chunk.usage.prompt_tokens;
        tokensSalida = chunk.usage.completion_tokens;
      }
    }
    const aviso = `\n\n${MENSAJE_IA_GENERAL}`;
    emitir({ tipo: 'delta', texto: aviso });

    const ide = await this.registrarConsulta(dto, {
      modo: 'IA_GENERAL',
      ideInarti: producto?.ide_inarti,
      respuesta: texto + aviso,
      modelo: BDT_CONFIG.MODELO_IA_GENERAL,
      tokensEntrada,
      tokensSalida,
    });
    emitir({ tipo: 'fin', modo: 'IA_GENERAL', ide_bdcon: ide });
  }

  // ------------------------------------------------------------------ producto

  /**
   * Productos con base técnica mencionados en el texto: primero por palabras ponderadas (ver
   * detector-producto.helper); si no hay ninguna coincidencia, respaldo por trigramas para
   * tolerar errores de tipeo ("acido citrco").
   */
  async buscarCandidatos(texto: string, ideEmpr: number): Promise<ProductoCandidato[]> {
    const porPalabras = detectarProductos(texto, await this.getIndiceProductos(ideEmpr));
    if (porPalabras.length) {
      return porPalabras.map(({ ide_inarti, nombre, coincidencia, cobertura, similitud, documentos }) => ({
        ide_inarti,
        nombre,
        coincidencia,
        cobertura,
        similitud,
        documentos,
      }));
    }

    const r = await this.dataSource.pool.query(
      `WITH q AS (SELECT UPPER(bdt_f_unaccent($1)) AS t),
       c AS (
          SELECT p.ide_inarti, p.nombre_bdprd AS nombre, p.nombre_bdprd AS coincidencia,
                 word_similarity(p.nombre_norm_bdprd, q.t) AS similitud, p.total_documentos_bdprd AS documentos
            FROM bdt_producto p, q
           WHERE p.ide_empr = $2 AND p.total_documentos_bdprd > 0
          UNION ALL
          SELECT p.ide_inarti, p.nombre_bdprd, s.sinonimo_bdsin,
                 word_similarity(s.sinonimo_norm_bdsin, q.t), p.total_documentos_bdprd
            FROM bdt_sinonimo s
            JOIN bdt_producto p ON p.ide_inarti = s.ide_inarti, q
           WHERE s.ide_empr = $2 AND p.total_documentos_bdprd > 0 AND LENGTH(s.sinonimo_norm_bdsin) >= 4
       )
       SELECT * FROM (
          SELECT DISTINCT ON (ide_inarti) ide_inarti, nombre, coincidencia, similitud::float AS similitud, documentos
            FROM c WHERE similitud >= $3
           ORDER BY ide_inarti, similitud DESC
       ) x ORDER BY similitud DESC, nombre LIMIT 8`,
      [texto, ideEmpr, BDT_CONFIG.UMBRAL_SIMILITUD_PRODUCTO],
    );
    return r.rows.map((x) => {
      const similitud = Math.round(Number(x.similitud) * 100) / 100;
      return { ...x, similitud, cobertura: similitud, documentos: Number(x.documentos) };
    });
  }

  /** Nombres + sinónimos de los productos con base técnica (cache 60 s por empresa). */
  private async getIndiceProductos(ideEmpr: number): Promise<EntradaIndiceProducto[]> {
    const cache = this.cacheIndice.get(ideEmpr);
    if (cache && cache.expira > Date.now()) return cache.data;
    const r = await this.dataSource.pool.query(
      `SELECT p.ide_inarti, p.nombre_bdprd AS nombre, p.nombre_bdprd AS texto, p.total_documentos_bdprd AS documentos
         FROM bdt_producto p
        WHERE p.ide_empr = $1 AND p.total_documentos_bdprd > 0
       UNION ALL
       SELECT p.ide_inarti, p.nombre_bdprd, s.sinonimo_bdsin, p.total_documentos_bdprd
         FROM bdt_sinonimo s JOIN bdt_producto p ON p.ide_inarti = s.ide_inarti
        WHERE s.ide_empr = $1 AND p.total_documentos_bdprd > 0`,
      [ideEmpr],
    );
    const data = r.rows.map((x) => ({ ...x, documentos: Number(x.documentos) }));
    this.cacheIndice.set(ideEmpr, { expira: Date.now() + 60_000, data });
    return data;
  }

  private async getProductoBdt(ideInarti: number, ideEmpr: number): Promise<{ ide_inarti: number; nombre: string } | null> {
    const r = await this.dataSource.pool.query(
      `SELECT ide_inarti, nombre_bdprd AS nombre FROM bdt_producto WHERE ide_inarti = $1 AND ide_empr = $2`,
      [ideInarti, ideEmpr],
    );
    return r.rows[0] ?? null;
  }

  /** Para el selector "Cambiar producto" del chat. Texto vacío = procesados más recientemente. */
  async buscarProductos(dto: BuscarProductosBdtDto & HeaderParamsDto) {
    const texto = (dto.texto ?? '').trim();
    const r = await this.dataSource.pool.query(
      `SELECT p.ide_inarti, p.nombre_bdprd AS nombre, p.codigo_bdprd AS codigo, p.total_documentos_bdprd AS documentos,
              p.total_ft_bdprd AS ft, p.total_coa_bdprd AS coa, p.total_sds_bdprd AS sds, p.fecha_ultimo_proceso_bdprd
         FROM bdt_producto p
        WHERE p.ide_empr = $1 AND p.total_documentos_bdprd > 0
          AND ($2 = '' OR p.nombre_norm_bdprd LIKE '%' || UPPER(bdt_f_unaccent($2)) || '%'
               OR p.codigo_bdprd ILIKE '%' || $2 || '%'
               OR EXISTS (SELECT 1 FROM bdt_sinonimo s WHERE s.ide_inarti = p.ide_inarti
                            AND s.sinonimo_norm_bdsin LIKE '%' || UPPER(bdt_f_unaccent($2)) || '%'))
        ORDER BY CASE WHEN $2 = '' THEN p.fecha_ultimo_proceso_bdprd END DESC NULLS LAST, p.nombre_bdprd
        LIMIT 30`,
      [dto.ideEmpr, texto],
    );
    return { rowCount: r.rows.length, rows: r.rows };
  }

  // ------------------------------------------------------------------ contexto

  private async construirContexto(ideInarti: number, ideEmpr: number, pregunta: string, nombreProducto: string) {
    const docsR = await this.dataSource.pool.query(
      `SELECT d.ide_bddoc, d.tipo_bddoc, d.nombre_original_bddoc, d.uuid_origen_bddoc::text AS uuid_origen_bddoc,
              d.estado_bddoc, d.idioma_bddoc, d.paginas_bddoc,
              TO_CHAR(d.fecha_referencia_bddoc, 'YYYY-MM-DD') AS fecha_referencia_bddoc,
              TO_CHAR(d.fecha_emision_bddoc, 'YYYY-MM-DD') AS emision,
              TO_CHAR(d.fecha_revision_bddoc, 'YYYY-MM-DD') AS revision,
              TO_CHAR(d.fecha_fabricacion_bddoc, 'YYYY-MM-DD') AS fabricacion,
              TO_CHAR(d.fecha_analisis_bddoc, 'YYYY-MM-DD') AS analisis,
              TO_CHAR(d.fecha_vencimiento_bddoc, 'YYYY-MM-DD') AS vencimiento,
              d.producto_detectado_bddoc, f.nombre_bdfab, f.pais_bdfab, pv.nombre_bdprv, pf.vigente_bdpfa,
              pf.grado_bdpfa, pf.cas_bdpfa, pf.pais_origen_bdpfa,
              d.datos_bddoc -> 'presentacion' AS presentacion, d.datos_bddoc -> 'observaciones' AS observaciones
         FROM bdt_documento d
         LEFT JOIN bdt_producto_fabricante pf ON pf.ide_bdpfa = d.ide_bdpfa
         LEFT JOIN bdt_fabricante f ON f.ide_bdfab = pf.ide_bdfab
         LEFT JOIN bdt_proveedor pv ON pv.ide_bdprv = d.ide_bdprv
        WHERE d.ide_inarti = $1 AND d.ide_empr = $2 AND d.vigente_bddoc AND d.estado_bddoc = ANY($3)
          AND d.tipo_bddoc <> 'OTRO'
        ORDER BY d.tipo_bddoc, d.fecha_referencia_bddoc DESC NULLS LAST, d.ide_bddoc DESC`,
      [ideInarti, ideEmpr, ESTADOS_FUENTE_CHAT],
    );
    const docs: (DocContexto & Record<string, any>)[] = docsR.rows.map((d, i) => ({ ...d, etiqueta: `D${i + 1}` }));
    if (!docs.length) return { docs, texto: '' };

    const ids = docs.map((d) => d.ide_bddoc);
    const etiqueta = (id: number) => docs.find((d) => d.ide_bddoc === id)?.etiqueta ?? '?';

    const [valoresR, lotesR] = await Promise.all([
      this.dataSource.pool.query(
        `SELECT v.ide_bddoc, v.naturaleza_bdval, v.nombre_original_bdval, v.valor_texto_bdval, v.unidad_bdval,
                v.especificacion_bdval, v.metodo_bdval, v.pagina_bdval, l.numero_bdlot, p.nombre_es_bdpro
           FROM bdt_valor v
           LEFT JOIN bdt_lote l ON l.ide_bdlot = v.ide_bdlot
           LEFT JOIN bdt_propiedad p ON p.ide_bdpro = v.ide_bdpro
          WHERE v.ide_bddoc = ANY($1)
          ORDER BY v.ide_bddoc, v.ide_bdval`,
        [ids],
      ),
      this.dataSource.pool.query(
        `SELECT l.ide_bddoc, l.numero_bdlot, TO_CHAR(l.fecha_fabricacion_bdlot, 'YYYY-MM-DD') AS fabricacion,
                TO_CHAR(l.fecha_analisis_bdlot, 'YYYY-MM-DD') AS analisis,
                TO_CHAR(l.fecha_vencimiento_bdlot, 'YYYY-MM-DD') AS vencimiento,
                l.cumple_bdlot, l.pais_origen_bdlot, l.presentacion_bdlot
           FROM bdt_lote l
          WHERE l.ide_inarti = $1 AND l.ide_empr = $2 AND l.ide_bddoc = ANY($3)
          ORDER BY COALESCE(l.fecha_analisis_bdlot, l.fecha_fabricacion_bdlot) DESC NULLS LAST`,
        [ideInarti, ideEmpr, ids],
      ),
    ]);

    const secciones = await this.seleccionarSecciones(ids, pregunta);

    const partes: string[] = [`PRODUCTO: ${nombreProducto}`, '', 'DOCUMENTOS:'];
    for (const d of docs) {
      const fechas = [
        d.emision && `emisión ${d.emision}`,
        d.revision && `revisión ${d.revision}`,
        d.fabricacion && `fabricación ${d.fabricacion}`,
        d.analisis && `análisis ${d.analisis}`,
        d.vencimiento && `vencimiento ${d.vencimiento}`,
      ].filter(Boolean);
      const origen = [
        d.nombre_bdfab && `fabricante ${d.nombre_bdfab}${d.pais_bdfab ? ` (${d.pais_bdfab})` : ''}`,
        d.nombre_bdprv && `proveedor ${d.nombre_bdprv}`,
        d.grado_bdpfa && `grado ${d.grado_bdpfa}`,
        d.cas_bdpfa && `CAS ${d.cas_bdpfa}`,
        d.pais_origen_bdpfa && `origen ${d.pais_origen_bdpfa}`,
        d.presentacion && `presentación ${String(d.presentacion).replace(/"/g, '')}`,
        d.vigente_bdpfa && '[VIGENTE]',
      ].filter(Boolean);
      partes.push(
        `[${d.etiqueta}] ${ETIQUETA_TIPO_DOCUMENTO[d.tipo_bddoc]} · "${d.nombre_original_bddoc}"` +
          (d.producto_detectado_bddoc ? ` · producto en documento: ${d.producto_detectado_bddoc}` : '') +
          (origen.length ? ` · ${origen.join(' · ')}` : '') +
          (fechas.length ? ` · ${fechas.join(', ')}` : '') +
          (d.estado_bddoc === 'REVISION' ? ' · (pendiente de revisión)' : '') +
          (d.observaciones && d.observaciones !== 'null' ? ` · nota: ${String(d.observaciones).replace(/"/g, '')}` : ''),
      );
    }

    if (lotesR.rows.length) {
      partes.push('', 'LOTES (certificados de análisis, más reciente primero):');
      for (const l of lotesR.rows) {
        partes.push(
          `[${etiqueta(l.ide_bddoc)}] Lote ${l.numero_bdlot}` +
            [
              l.fabricacion && `fabricación ${l.fabricacion}`,
              l.analisis && `análisis ${l.analisis}`,
              l.vencimiento && `vencimiento ${l.vencimiento}`,
              l.cumple_bdlot === true && 'cumple especificación',
              l.cumple_bdlot === false && 'NO cumple especificación',
              l.pais_origen_bdlot && `origen ${l.pais_origen_bdlot}`,
              l.presentacion_bdlot && `presentación ${l.presentacion_bdlot}`,
            ]
              .filter(Boolean)
              .map((x) => ` · ${x}`)
              .join(''),
        );
      }
    }

    if (valoresR.rows.length) {
      partes.push('', 'VALORES TÉCNICOS:');
      for (const v of valoresR.rows) {
        const tipo = v.naturaleza_bdval === 'RESULTADO' ? 'resultado' : v.naturaleza_bdval === 'TIPICO' ? 'típico' : 'especificación';
        partes.push(
          `[${etiqueta(v.ide_bddoc)}${v.pagina_bdval ? ` p.${v.pagina_bdval}` : ''}] ${v.nombre_original_bdval}` +
            `${v.nombre_es_bdpro ? ` (${v.nombre_es_bdpro})` : ''}: ${tipo} ${v.valor_texto_bdval ?? '—'}` +
            `${v.unidad_bdval && !(v.valor_texto_bdval ?? '').includes(v.unidad_bdval) ? ` ${v.unidad_bdval}` : ''}` +
            `${v.especificacion_bdval ? ` | especificación ${v.especificacion_bdval}` : ''}` +
            `${v.numero_bdlot ? ` | lote ${v.numero_bdlot}` : ''}` +
            `${v.metodo_bdval ? ` | método ${v.metodo_bdval}` : ''}`,
        );
      }
    }

    if (secciones.length) {
      partes.push('', 'SECCIONES DE LOS DOCUMENTOS:');
      let usado = partes.join('\n').length;
      for (const s of secciones) {
        const bloque =
          `[${etiqueta(s.ide_bddoc)}${s.pagina_desde_bdsec ? ` p.${s.pagina_desde_bdsec}` : ''}] ` +
          `${s.titulo_bdsec}:\n${s.contenido_bdsec}`;
        if (usado + bloque.length > BDT_CONFIG.MAX_CONTEXTO_CHAT) break;
        partes.push(bloque);
        usado += bloque.length;
      }
    }

    return { docs, texto: partes.join('\n') };
  }

  /**
   * Si toda la documentación del producto cabe en el contexto se envía completa (sin riesgo de
   * que la búsqueda deje fuera la sección correcta). Si no, se priorizan las secciones más
   * relevantes con búsqueda de texto en español + inglés.
   */
  private async seleccionarSecciones(ids: number[], pregunta: string) {
    const total = await this.dataSource.pool.query(
      `SELECT COALESCE(SUM(LENGTH(contenido_bdsec)), 0)::int AS chars FROM bdt_seccion WHERE ide_bddoc = ANY($1)`,
      [ids],
    );
    const columnas = `ide_bddoc, titulo_bdsec, contenido_bdsec, pagina_desde_bdsec, clave_bdsec`;
    if (total.rows[0].chars <= BDT_CONFIG.MAX_CONTEXTO_CHAT * 0.75) {
      const r = await this.dataSource.pool.query(
        `SELECT ${columnas} FROM bdt_seccion WHERE ide_bddoc = ANY($1) ORDER BY ide_bddoc, numero_bdsec NULLS LAST, ide_bdsec`,
        [ids],
      );
      return r.rows;
    }

    const terminos = [
      ...new Set(
        normalizarTexto(pregunta)
          .replace(/[^A-Z0-9 ]/g, ' ')
          .split(' ')
          .filter((t) => t.length >= 3),
      ),
    ];
    if (!terminos.length) {
      const r = await this.dataSource.pool.query(
        `SELECT ${columnas} FROM bdt_seccion WHERE ide_bddoc = ANY($1) ORDER BY ide_bddoc, numero_bdsec NULLS LAST LIMIT $2`,
        [ids, BDT_CONFIG.MAX_SECCIONES_CHAT],
      );
      return r.rows;
    }
    const consulta = terminos.join(' | ');
    const r = await this.dataSource.pool.query(
      `SELECT ${columnas},
              ts_rank(tsv_bdsec, to_tsquery('spanish', $2)) + ts_rank(tsv_bdsec, to_tsquery('english', $2)) AS rank
         FROM bdt_seccion
        WHERE ide_bddoc = ANY($1)
        ORDER BY rank DESC, ide_bddoc, numero_bdsec NULLS LAST
        LIMIT $3`,
      [ids, consulta.toLowerCase(), BDT_CONFIG.MAX_SECCIONES_CHAT],
    );
    return r.rows;
  }

  private resolverCitas(citas: RespuestaChatDocumentos['citas'], docs: DocContexto[]): CitaChat[] {
    const vistas = new Set<string>();
    const resultado: CitaChat[] = [];
    for (const c of citas) {
      const etiqueta = (c.doc || '').replace(/[[\]\s]/g, '').toUpperCase();
      const doc = docs.find((d) => d.etiqueta === etiqueta);
      if (!doc) continue;
      const clave = `${doc.ide_bddoc}-${c.pagina ?? ''}-${c.seccion ?? ''}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      const tipoEtiqueta = ETIQUETA_TIPO_DOCUMENTO[doc.tipo_bddoc] ?? doc.tipo_bddoc;
      resultado.push({
        ide_bddoc: doc.ide_bddoc,
        archivo: doc.nombre_original_bddoc,
        uuid: doc.uuid_origen_bddoc,
        extension: (doc.nombre_original_bddoc.split('.').pop() || 'pdf').toLowerCase(),
        tipo: doc.tipo_bddoc,
        tipo_etiqueta: tipoEtiqueta,
        pagina: Number.isInteger(c.pagina) ? c.pagina : null,
        seccion: c.seccion,
        referencia: [doc.nombre_original_bddoc, tipoEtiqueta, c.seccion, c.pagina ? `pág. ${c.pagina}` : null]
          .filter(Boolean)
          .join(' · '),
      });
    }
    return resultado;
  }

  private historialReciente(dto: ChatBaseTecnicaDto): OpenAI.ChatCompletionMessageParam[] {
    return (dto.historial ?? [])
      .slice(-BDT_CONFIG.MAX_HISTORIAL_CHAT)
      .map((m) => ({ role: m.role, content: m.contenido.slice(0, 3000) }) as OpenAI.ChatCompletionMessageParam);
  }

  // ------------------------------------------------------------------ registro

  private async registrarConsulta(
    dto: ChatBaseTecnicaDto & HeaderParamsDto,
    datos: {
      modo: 'DOCUMENTOS' | 'IA_GENERAL' | 'SELECCION';
      ideInarti?: number;
      respuesta?: string;
      sinDato?: boolean;
      documentos?: number[];
      citas?: CitaChat[];
      modelo?: string;
      tokensEntrada?: number;
      tokensSalida?: number;
    },
  ): Promise<number | null> {
    try {
      const r = await this.dataSource.pool.query(
        `INSERT INTO bdt_consulta (ide_inarti, canal_bdcon, sesion_bdcon, modo_bdcon, pregunta_bdcon, respuesta_bdcon,
                                   documentos_bdcon, citas_bdcon, sin_dato_bdcon, modelo_ia_bdcon,
                                   tokens_entrada_bdcon, tokens_salida_bdcon, ide_empr, usuario_ingre)
         VALUES ($1, 'ASESOR', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING ide_bdcon`,
        [
          datos.ideInarti ?? dto.ide_inarti ?? null,
          dto.sesion,
          datos.modo,
          dto.pregunta,
          datos.respuesta ?? null,
          datos.documentos ?? null,
          datos.citas ? JSON.stringify(datos.citas) : null,
          datos.sinDato ?? false,
          datos.modelo ?? null,
          datos.tokensEntrada ?? null,
          datos.tokensSalida ?? null,
          dto.ideEmpr,
          dto.login,
        ],
      );
      return r.rows[0].ide_bdcon;
    } catch (error) {
      // El registro es auditoría: nunca debe romper la respuesta al usuario.
      this.logger.warn(`No se pudo registrar la consulta: ${error?.message}`);
      return null;
    }
  }

  async calificarConsulta(dto: CalificarConsultaDto & HeaderParamsDto) {
    await this.dataSource.pool.query(`UPDATE bdt_consulta SET util_bdcon = $2 WHERE ide_bdcon = $1 AND ide_empr = $3`, [
      dto.ide_bdcon,
      dto.util,
      dto.ideEmpr,
    ]);
    return { message: 'ok' };
  }
}
