import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { HOST_API } from 'src/util/helpers/common-util';

import { BdtProcesoService } from './bdt-proceso.service';
import { BDT_CONFIG, ESTADOS_FUENTE_CHAT, ETIQUETA_TIPO_DOCUMENTO } from './constants/base-tecnica.constants';
import { clasificarPorNombre } from './helpers/clasificador.helper';
import { normalizarTexto } from './helpers/normalizar.helper';

export interface DocContexto {
  etiqueta: string;
  ide_bddoc: number;
  tipo_bddoc: string;
  nombre_original_bddoc: string;
  uuid_origen_bddoc: string;
  estado_bddoc: string;
  fecha_referencia_bddoc: string | null;
}

/** Cita tal como la devuelve la IA (etiqueta del documento del contexto). */
export interface CitaIa {
  doc: string;
  pagina?: number | null;
  seccion?: string | null;
}

export interface CitaDocumento {
  ide_bddoc: number;
  archivo: string;
  uuid: string;
  /** URL absoluta del adjunto original: sirve igual en el ERP, en la API o en Telegram. */
  url: string;
  tipo: string;
  tipo_etiqueta: string;
  pagina: number | null;
  seccion: string | null;
  referencia: string;
}

export interface DocumentoListado {
  ide_bddoc: number;
  tipo: string;
  tipo_etiqueta: string;
  archivo: string;
  url: string;
  fecha: string | null;
  lote: string | null;
  fabricante: string | null;
  estado: string;
}

/** URL pública de descarga del adjunto (mismo endpoint que usa el explorador de archivos). */
export function urlDocumento(uuid: string, nombreArchivo: string): string {
  const extension = (nombreArchivo.split('.').pop() || 'pdf').toLowerCase();
  return `${HOST_API()}/api/sistema/files/downloadFile/${uuid}.${extension}`;
}

/**
 * Consultas de lectura sobre la base técnica para el asistente QuimIA: contexto técnico de un
 * producto, listado de documentos con links y verificación de citas. Solo lee tablas bdt_*.
 */
@Injectable()
export class BdtConsultaService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proceso: BdtProcesoService,
  ) {}

  /**
   * Adjuntos del producto (PDF/imagen) que todavía NO están en la base técnica, con el tipo deducido
   * del nombre del archivo. Permite entregar el link de "la ficha técnica" aunque aún no se haya
   * procesado. tipo = null → todos; con tipo, también se incluyen los de nombre no reconocible.
   */
  async listarAdjuntosSinProcesar(ideInarti: number, ideEmpr: number, tipo: string | null, limite: number): Promise<DocumentoListado[]> {
    const [archivos, extraidos] = await Promise.all([
      this.proceso.listarArchivosProducto(ideInarti, ideEmpr),
      this.dataSource.pool.query(`SELECT uuid_origen_bddoc::text AS uuid FROM bdt_documento WHERE ide_inarti = $1 AND ide_empr = $2`, [
        ideInarti,
        ideEmpr,
      ]),
    ]);
    const yaExtraidos = new Set(extraidos.rows.map((r) => r.uuid));
    const candidatos = archivos
      .filter((a) => BDT_CONFIG.EXTENSIONES_SOPORTADAS.includes((a.nombre.split('.').pop() || '').toLowerCase()))
      .filter((a) => !yaExtraidos.has(a.uuid))
      .map((a) => ({ archivo: a, tipo: clasificarPorNombre(`${a.ruta} ${a.nombre}`) }));
    const coinciden = tipo ? candidatos.filter((c) => c.tipo === tipo) : candidatos;
    // Si pidieron un tipo y ningún nombre lo indica, se ofrecen los no reconocibles (puede ser ese).
    const elegidos = coinciden.length || !tipo ? coinciden : candidatos.filter((c) => c.tipo === null);
    return elegidos.slice(0, Math.min(Math.max(limite, 1), 10)).map(({ archivo, tipo: t }) => ({
      ide_bddoc: 0,
      tipo: t ?? 'SIN_CLASIFICAR',
      tipo_etiqueta: t ? ETIQUETA_TIPO_DOCUMENTO[t] : 'Documento',
      archivo: archivo.nombre,
      url: urlDocumento(archivo.uuid, archivo.nombre),
      fecha: null,
      lote: null,
      fabricante: null,
      estado: 'SIN_PROCESAR',
    }));
  }

  /**
   * Documentos técnicos vigentes del producto, más recientes primero (COA por fecha de análisis
   * o fabricación). tipo = null → todos los tipos.
   */
  async listarDocumentos(
    ideInarti: number,
    ideEmpr: number,
    tipo: string | null,
    limite: number,
  ): Promise<DocumentoListado[]> {
    const r = await this.dataSource.pool.query(
      `SELECT d.ide_bddoc, d.tipo_bddoc, d.nombre_original_bddoc, d.uuid_origen_bddoc::text AS uuid, d.estado_bddoc,
              TO_CHAR(d.fecha_referencia_bddoc, 'YYYY-MM-DD') AS fecha,
              COALESCE(l.numero_bdlot, d.lote_detectado_bddoc) AS lote,
              COALESCE(f.nombre_bdfab, d.fabricante_detectado_bddoc) AS fabricante
         FROM bdt_documento d
         LEFT JOIN bdt_lote l ON l.ide_bdlot = d.ide_bdlot
         LEFT JOIN bdt_producto_fabricante pf ON pf.ide_bdpfa = d.ide_bdpfa
         LEFT JOIN bdt_fabricante f ON f.ide_bdfab = pf.ide_bdfab
        WHERE d.ide_inarti = $1 AND d.ide_empr = $2 AND d.vigente_bddoc
          AND d.estado_bddoc = ANY($3) AND d.tipo_bddoc <> 'OTRO'
          AND ($4::text IS NULL OR d.tipo_bddoc = $4)
        ORDER BY d.fecha_referencia_bddoc DESC NULLS LAST, d.ide_bddoc DESC
        LIMIT $5`,
      [ideInarti, ideEmpr, ESTADOS_FUENTE_CHAT, tipo, Math.min(Math.max(limite, 1), 20)],
    );
    return r.rows.map((d) => ({
      ide_bddoc: d.ide_bddoc,
      tipo: d.tipo_bddoc,
      tipo_etiqueta: ETIQUETA_TIPO_DOCUMENTO[d.tipo_bddoc] ?? d.tipo_bddoc,
      archivo: d.nombre_original_bddoc,
      url: urlDocumento(d.uuid, d.nombre_original_bddoc),
      fecha: d.fecha,
      lote: d.lote,
      fabricante: d.fabricante,
      estado: d.estado_bddoc,
    }));
  }

  /**
   * Contexto técnico del producto para la IA: documentos (etiquetados D1, D2…), lotes, valores y
   * secciones. Las etiquetas permiten verificar después qué documentos citó la respuesta.
   */
  async construirContexto(ideInarti: number, ideEmpr: number, pregunta: string, nombreProducto: string) {
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

  /** Convierte las etiquetas citadas por la IA en citas reales; descarta las que no existen. */
  resolverCitas(citas: CitaIa[], docs: DocContexto[]): CitaDocumento[] {
    const vistas = new Set<string>();
    const resultado: CitaDocumento[] = [];
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
        url: urlDocumento(doc.uuid_origen_bddoc, doc.nombre_original_bddoc),
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
}
