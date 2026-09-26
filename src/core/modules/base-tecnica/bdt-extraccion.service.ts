import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { BdtIaService, EntradaDocumentoIa } from './bdt-ia.service';
import {
  BDT_CONFIG,
  ETIQUETA_TIPO_DOCUMENTO,
  NATURALEZAS_VALOR_BDT,
  TipoDocumentoBdt,
  costoIa,
} from './constants/base-tecnica.constants';
import { clasificarPorReglas } from './helpers/clasificador.helper';
import {
  esCasValido,
  esValorNumerico,
  normalizarTexto,
  parseFecha,
  parseNumero,
  recortar,
  similitudPalabras,
} from './helpers/normalizar.helper';
import { PaginaTexto, extraerTextoPdf, textoConPaginas, textoDeRango } from './helpers/pdf-texto.helper';
import { ExtraccionDocumento, buildPromptExtraccion } from './prompts/extraccion.prompt';

export interface ArchivoParaExtraer {
  buffer: Buffer;
  nombre: string;
  extension: string;
  mime: string | null;
}

export interface ValorExtraido {
  clave: string | null;
  nombreOriginal: string;
  naturaleza: string;
  valorTexto: string | null;
  operador: string | null;
  valorNum: number | null;
  valorMin: number | null;
  valorMax: number | null;
  unidad: string | null;
  metodo: string | null;
  especificacion: string | null;
  pagina: number | null;
}

export interface SeccionExtraida {
  clave: string;
  numero: number | null;
  titulo: string;
  contenidoEs: string;
  contenidoOriginal: string | null;
  paginaDesde: number | null;
  paginaHasta: number | null;
}

export interface DocumentoExtraido {
  tipo: TipoDocumentoBdt;
  tipoFuente: 'REGLAS' | 'IA';
  idioma: string | null;
  metodo: 'TEXTO' | 'VISION';
  paginas: number;
  textoOriginal: string;
  textoEs: string | null;
  markdown: string;
  datos: ExtraccionDocumento;
  valores: ValorExtraido[];
  secciones: SeccionExtraida[];
  fechas: {
    emision: string | null;
    revision: string | null;
    fabricacion: string | null;
    analisis: string | null;
    vencimiento: string | null;
  };
  confianza: number;
  motivosRevision: string[];
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  /** Costo IA en USD (suma de todas las llamadas; 0 si se reutilizó otra extracción). */
  costoUsd: number;
}

/** Extracción ya guardada (bdt_documento) que se reutiliza para el mismo documento en otro producto. */
export interface ExtraccionPrevia {
  datos: ExtraccionDocumento;
  textoOriginal: string | null;
  metodo: 'TEXTO' | 'VISION';
  paginas: number;
  motivos: string[];
  modelo: string;
}

/**
 * Lee un archivo (PDF con texto, PDF escaneado o imagen) y devuelve su contenido técnico
 * estructurado. No toca la base de datos: la persistencia es de BdtProcesoService.
 */
/** "<<<PÁGINA N>>>\n..." (transcripción de la relectura) → páginas. */
function paginasDeTranscripcion(texto: string): PaginaTexto[] {
  const partes = texto.split(/^<<<P[ÁA]GINA\s*(\d+)>>>\s*$/im);
  const paginas: PaginaTexto[] = [];
  if (partes[0]?.trim()) paginas.push({ numero: 1, texto: partes[0].trim() });
  for (let i = 1; i < partes.length; i += 2) {
    const t = (partes[i + 1] ?? '').trim();
    if (t) paginas.push({ numero: Number(partes[i]), texto: t });
  }
  return paginas;
}

/** "[Página N]\n..." (texto_original_bddoc guardado) → páginas. */
function paginasDeTextoOriginal(texto: string | null): PaginaTexto[] {
  if (!texto) return [];
  const partes = texto.split(/^\[P[áa]gina\s*(\d+)\]\s*$/im);
  const paginas: PaginaTexto[] = [];
  for (let i = 1; i < partes.length; i += 2) {
    const t = (partes[i + 1] ?? '').trim();
    if (t) paginas.push({ numero: Number(partes[i]), texto: t });
  }
  return paginas.length ? paginas : [{ numero: 1, texto: texto.trim() }];
}

@Injectable()
export class BdtExtraccionService {
  private readonly logger = new Logger(BdtExtraccionService.name);

  constructor(private readonly ia: BdtIaService) {}

  /**
   * Extrae con el modelo económico. Si el documento es escaneado/imagen y la confianza queda en
   * UMBRAL_RELECTURA (85%) o menos, se vuelve a leer con MODELO_RELECTURA_VISION y se queda la mejor
   * lectura. Solo en esos casos, para no subir el costo de los demás documentos.
   */
  async extraer(
    archivo: ArchivoParaExtraer,
    contexto: { nombreProductoErp: string; clavesPropiedad: string[] },
  ): Promise<DocumentoExtraido> {
    const primera = await this.leer(archivo, contexto);
    if (primera.metodo !== 'VISION' || primera.confianza > BDT_CONFIG.UMBRAL_RELECTURA) return primera;

    try {
      const segunda = await this.releer(archivo, contexto);
      if (!segunda) return primera;
      const puntos = (d: DocumentoExtraido) => d.secciones.length + d.valores.length;
      const mejor =
        segunda.confianza > primera.confianza || (segunda.confianza === primera.confianza && puntos(segunda) >= puntos(primera))
          ? segunda
          : primera;
      this.logger.log(
        `${archivo.nombre}: relectura ${segunda.modelo} ${(primera.confianza * 100).toFixed(0)}% → ` +
          `${(segunda.confianza * 100).toFixed(0)}% (se usa ${mejor === segunda ? 'la relectura' : 'la primera lectura'})`,
      );
      // Costo real: se pagaron las dos lecturas.
      return {
        ...mejor,
        tokensEntrada: primera.tokensEntrada + segunda.tokensEntrada,
        tokensSalida: primera.tokensSalida + segunda.tokensSalida,
        costoUsd: primera.costoUsd + segunda.costoUsd,
      };
    } catch (error) {
      this.logger.warn(`${archivo.nombre}: relectura falló (${(error as Error).message}); se usa la primera lectura`);
      return primera;
    }
  }

  /** Relectura: transcripción en texto plano con MODELO_TRANSCRIPCION y extracción normal de texto. */
  private async releer(
    archivo: ArchivoParaExtraer,
    contexto: { nombreProductoErp: string; clavesPropiedad: string[] },
  ): Promise<DocumentoExtraido | null> {
    const entrada: EntradaDocumentoIa =
      archivo.extension === 'pdf'
        ? { tipo: 'pdf', base64: archivo.buffer.toString('base64'), nombreArchivo: archivo.nombre }
        : {
            tipo: 'imagen',
            base64: archivo.buffer.toString('base64'),
            mime: archivo.mime || `image/${archivo.extension === 'jpg' ? 'jpeg' : archivo.extension}`,
          };
    const tr = await this.ia.transcribirDocumento(entrada);
    const paginas = paginasDeTranscripcion(tr.texto);
    if (!paginas.length) return null;
    const r = await this.leer(archivo, contexto, paginas);
    return {
      ...r,
      modelo: `${tr.modelo.replace(/-\d{4}-\d{2}-\d{2}$/, '')}+${r.modelo.replace(/-\d{4}-\d{2}-\d{2}$/, '')}`.slice(0, 50),
      tokensEntrada: r.tokensEntrada + tr.tokensEntrada,
      tokensSalida: r.tokensSalida + tr.tokensSalida,
      costoUsd: r.costoUsd + costoIa(tr.modelo, tr.tokensEntrada, tr.tokensSalida),
    };
  }

  /**
   * "Extracción mejorada" (botón del diálogo / lote): escaneado o imagen → transcripción + extracción
   * (siempre, sin esperar a que la confianza sea baja); PDF con texto → extracción con un modelo mejor.
   */
  async extraerMejorado(
    archivo: ArchivoParaExtraer,
    contexto: { nombreProductoErp: string; clavesPropiedad: string[] },
  ): Promise<DocumentoExtraido> {
    const escaneado = archivo.extension !== 'pdf' || (await extraerTextoPdf(archivo.buffer)).escaneado;
    if (escaneado) {
      const r = await this.releer(archivo, contexto);
      if (r) return r;
    }
    return this.leer(archivo, contexto, undefined, BDT_CONFIG.MODELO_EXTRACCION_MEJORADA);
  }

  /**
   * Huella del TEXTO de un PDF con texto (gratis, sin IA): detecta el mismo documento guardado de
   * nuevo (otro archivo, mismos datos). null si es escaneado/imagen o no tiene texto suficiente.
   */
  async huellaTexto(archivo: ArchivoParaExtraer): Promise<string | null> {
    if (archivo.extension !== 'pdf') return null;
    try {
      const pdf = await extraerTextoPdf(archivo.buffer);
      if (pdf.escaneado) return null;
      const texto = normalizarTexto(pdf.paginas.map((p) => p.texto).join(' '))
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
      return texto.length >= 200 ? createHash('sha256').update(texto).digest('hex') : null;
    } catch {
      return null;
    }
  }

  /**
   * Reutiliza la extracción de OTRO producto (mismo documento): sin IA, costo 0. Solo se recalcula lo
   * que depende del producto (confianza contra el nombre del producto, vigencias al persistir).
   */
  reutilizar(
    previa: ExtraccionPrevia,
    archivo: Pick<ArchivoParaExtraer, 'nombre'>,
    contexto: { nombreProductoErp: string },
  ): DocumentoExtraido {
    const paginas = paginasDeTextoOriginal(previa.textoOriginal);
    const esVision = previa.metodo === 'VISION';
    const textoPlano = paginas.map((p) => p.texto).join('\n');
    const reglas = esVision
      ? clasificarPorReglas('', '', archivo.nombre)
      : clasificarPorReglas(paginas[0]?.texto ?? '', textoPlano, archivo.nombre);
    // Motivos que dependen de cómo se leyó el documento (no del producto) se conservan.
    const motivos = previa.motivos.filter((m) => ['DOCUMENTO_ESCANEADO', 'DOCUMENTO_RECORTADO', 'RESPUESTA_TRUNCADA'].includes(m));
    return this.construir({
      datos: previa.datos,
      paginas,
      sinOriginalPorSeccion: esVision,
      metodo: previa.metodo,
      totalPaginas: previa.paginas || paginas.length || 1,
      reglas,
      motivos,
      nombreProductoErp: contexto.nombreProductoErp,
      modelo: `REUTILIZADO ${previa.modelo || ''}`.trim().slice(0, 50),
      tokensEntrada: 0,
      tokensSalida: 0,
      costoUsd: 0,
    });
  }

  /**
   * @param transcripcion páginas ya transcritas de un escaneado (relectura): se extrae como texto,
   * pero el documento sigue siendo escaneado (método VISION).
   */
  private async leer(
    archivo: ArchivoParaExtraer,
    contexto: { nombreProductoErp: string; clavesPropiedad: string[] },
    transcripcion?: PaginaTexto[],
    modeloExtraccion?: string,
  ): Promise<DocumentoExtraido> {
    const motivos: string[] = [];
    let paginas: PaginaTexto[] = [];
    let totalPaginas = 1;
    let esEscaneado = true;
    let entrada: EntradaDocumentoIa;

    if (transcripcion) {
      paginas = transcripcion;
      totalPaginas = transcripcion.length;
      esEscaneado = false;
      let texto = textoConPaginas(paginas);
      if (texto.length > BDT_CONFIG.MAX_CARACTERES_EXTRACCION) {
        texto = texto.slice(0, BDT_CONFIG.MAX_CARACTERES_EXTRACCION);
        motivos.push('DOCUMENTO_RECORTADO');
      }
      entrada = { tipo: 'texto', texto };
    } else if (archivo.extension === 'pdf') {
      const pdf = await extraerTextoPdf(archivo.buffer);
      paginas = pdf.paginas;
      totalPaginas = pdf.totalPaginas;
      esEscaneado = pdf.escaneado;

      if (esEscaneado) {
        entrada = { tipo: 'pdf', base64: archivo.buffer.toString('base64'), nombreArchivo: archivo.nombre };
      } else {
        let texto = textoConPaginas(paginas);
        if (texto.length > BDT_CONFIG.MAX_CARACTERES_EXTRACCION) {
          texto = texto.slice(0, BDT_CONFIG.MAX_CARACTERES_EXTRACCION);
          motivos.push('DOCUMENTO_RECORTADO');
        }
        entrada = { tipo: 'texto', texto };
      }
    } else {
      entrada = {
        tipo: 'imagen',
        base64: archivo.buffer.toString('base64'),
        mime: archivo.mime || `image/${archivo.extension === 'jpg' ? 'jpeg' : archivo.extension}`,
      };
    }

    const textoPlano = paginas.map((p) => p.texto).join('\n');
    const reglas = esEscaneado
      ? clasificarPorReglas('', '', archivo.nombre)
      : clasificarPorReglas(paginas[0]?.texto ?? '', textoPlano, archivo.nombre);

    const prompt = buildPromptExtraccion({
      clavesPropiedad: contexto.clavesPropiedad,
      pistaTipo: reglas.tipo,
      nombreProductoErp: contexto.nombreProductoErp,
      esEscaneado,
    });
    const ia = modeloExtraccion
      ? await this.ia.extraerDocumento(prompt, entrada, modeloExtraccion)
      : await this.ia.extraerDocumento(prompt, entrada);
    const datos = ia.datos;

    // Escaneado: el "texto original" es la transcripción que hizo la IA.
    if (esEscaneado) {
      const transcripcion = datos.transcripcion_original?.trim() || '';
      paginas = [{ numero: 1, texto: transcripcion }];
      motivos.push('DOCUMENTO_ESCANEADO');
    }
    if (transcripcion) motivos.push('DOCUMENTO_ESCANEADO');
    if (ia.truncado) motivos.push('RESPUESTA_TRUNCADA');

    return this.construir({
      datos,
      paginas,
      sinOriginalPorSeccion: esEscaneado,
      metodo: esEscaneado || transcripcion ? 'VISION' : 'TEXTO',
      totalPaginas,
      reglas,
      motivos,
      nombreProductoErp: contexto.nombreProductoErp,
      modelo: ia.modelo,
      tokensEntrada: ia.tokensEntrada,
      tokensSalida: ia.tokensSalida,
      costoUsd: costoIa(ia.modelo, ia.tokensEntrada, ia.tokensSalida),
    });
  }

  /** Arma el resultado a partir de la respuesta de la IA (nueva o reutilizada): valores, secciones, confianza. */
  private construir(p: {
    datos: ExtraccionDocumento;
    paginas: PaginaTexto[];
    /** Escaneado leído en una sola llamada: no hay texto original por sección. */
    sinOriginalPorSeccion: boolean;
    metodo: 'TEXTO' | 'VISION';
    totalPaginas: number;
    reglas: ReturnType<typeof clasificarPorReglas>;
    motivos: string[];
    nombreProductoErp: string;
    modelo: string;
    tokensEntrada: number;
    tokensSalida: number;
    costoUsd: number;
  }): DocumentoExtraido {
    const { datos, paginas, reglas, motivos } = p;
    const esEscaneado = p.sinOriginalPorSeccion;
    const tipo = datos.tipo_documento;
    const idioma = (datos.idioma || '').toLowerCase().slice(0, 5) || null;
    const esEspanol = idioma === 'es';

    const valores = this.normalizarValores(datos);
    const secciones = (datos.secciones ?? [])
      .filter((s) => s.contenido_es?.trim())
      .map((s) => ({
        clave: s.clave,
        numero: s.numero,
        titulo: recortar(s.titulo, 250) ?? s.clave,
        contenidoEs: s.contenido_es.trim(),
        // El original no se pide a la IA (duplicaría tokens de salida): se toma de las páginas.
        contenidoOriginal: esEspanol || esEscaneado ? null : textoDeRango(paginas, s.pagina_desde, s.pagina_hasta),
        paginaDesde: s.pagina_desde,
        paginaHasta: s.pagina_hasta,
      }));

    const fechas = {
      emision: parseFecha(datos.fechas?.emision),
      revision: parseFecha(datos.fechas?.revision),
      fabricacion: parseFecha(datos.fechas?.fabricacion),
      analisis: parseFecha(datos.fechas?.analisis),
      vencimiento: parseFecha(datos.fechas?.vencimiento),
    };

    const confianza = this.calcularConfianza({
      tipo,
      reglas,
      datos,
      valores,
      secciones,
      fechas,
      nombreProductoErp: p.nombreProductoErp,
      motivos,
    });

    const textoOriginal = paginas.map((p) => `[Página ${p.numero}]\n${p.texto}`).join('\n\n');

    return {
      tipo,
      tipoFuente: reglas.tipo === tipo && reglas.certeza >= 0.5 ? 'REGLAS' : 'IA',
      idioma,
      metodo: p.metodo,
      paginas: p.totalPaginas,
      textoOriginal,
      textoEs: esEspanol ? null : secciones.map((s) => `## ${s.titulo}\n${s.contenidoEs}`).join('\n\n') || null,
      markdown: this.generarMarkdown(tipo, datos, valores, secciones, fechas),
      datos,
      valores,
      secciones,
      fechas,
      confianza,
      motivosRevision: motivos,
      modelo: p.modelo,
      tokensEntrada: p.tokensEntrada,
      tokensSalida: p.tokensSalida,
      costoUsd: p.costoUsd,
    };
  }

  private normalizarValores(datos: ExtraccionDocumento): ValorExtraido[] {
    return (datos.valores ?? [])
      .filter((v) => v.nombre_original?.trim())
      .map((v) => {
        const operador = ['=', '>=', '<=', '>', '<', 'RANGO', 'TEXTO'].includes(v.operador ?? '') ? v.operador : null;
        let valorNum = typeof v.valor_num === 'number' ? v.valor_num : null;
        // Red de seguridad: si la IA dejó el número solo en el texto ("5,61"), se recupera aquí.
        if (
          valorNum === null &&
          v.valor_min === null &&
          v.valor_max === null &&
          operador !== 'TEXTO' &&
          esValorNumerico(v.valor_texto)
        ) {
          valorNum = parseNumero(v.valor_texto);
        }
        return {
          clave: v.clave ? v.clave.toUpperCase() : null,
          nombreOriginal: recortar(v.nombre_original, 200),
          naturaleza: NATURALEZAS_VALOR_BDT.includes(v.naturaleza) ? v.naturaleza : 'TIPICO',
          valorTexto: recortar(v.valor_texto, 250),
          operador,
          valorNum,
          valorMin: typeof v.valor_min === 'number' ? v.valor_min : null,
          valorMax: typeof v.valor_max === 'number' ? v.valor_max : null,
          unidad: recortar(v.unidad, 30),
          metodo: recortar(v.metodo, 120),
          especificacion: recortar(v.especificacion, 250),
          pagina: Number.isInteger(v.pagina) ? v.pagina : null,
        };
      });
  }

  /**
   * Confianza calculada por el backend con señales verificables — no la que "opina" la IA.
   * Arranca en 1 y resta por cada señal de duda; cada resta deja un motivo para la bandeja.
   */
  private calcularConfianza(p: {
    tipo: TipoDocumentoBdt;
    reglas: ReturnType<typeof clasificarPorReglas>;
    datos: ExtraccionDocumento;
    valores: ValorExtraido[];
    secciones: SeccionExtraida[];
    fechas: DocumentoExtraido['fechas'];
    nombreProductoErp: string;
    motivos: string[];
  }): number {
    let c = 1;
    const motivo = (m: string, resta: number) => {
      p.motivos.push(m);
      c -= resta;
    };

    if (p.tipo === 'OTRO') motivo('NO_ES_DOCUMENTO_TECNICO', 0.5);
    if (p.reglas.tipo && p.reglas.certeza >= 0.5 && p.reglas.tipo !== p.tipo) motivo('TIPO_DUDOSO', 0.3);

    const nombres = [p.datos.producto?.nombre, p.datos.producto?.nombre_comercial, ...(p.datos.producto?.sinonimos ?? [])]
      .filter(Boolean)
      .join(' ');
    if (!nombres) motivo('SIN_PRODUCTO', 0.15);
    else if (similitudPalabras(p.nombreProductoErp, nombres) === 0) motivo('PRODUCTO_NO_COINCIDE', 0.1);

    if (!Object.values(p.fechas).some(Boolean)) motivo('SIN_FECHA', 0.05);

    const cas = p.datos.producto?.cas;
    if (cas && !esCasValido(cas)) motivo('CAS_INVALIDO', 0.1);

    if (p.tipo === 'CERTIFICADO_ANALISIS') {
      if (!p.datos.lote?.numero) motivo('COA_SIN_LOTE', 0.3);
      if (!p.valores.some((v) => v.naturaleza === 'RESULTADO')) motivo('COA_SIN_RESULTADOS', 0.3);
    }
    if (p.tipo === 'FICHA_TECNICA' && !p.valores.length && !p.secciones.length) motivo('SIN_CONTENIDO', 0.3);
    if (p.tipo === 'HOJA_SEGURIDAD' && p.secciones.length < 8) motivo('SDS_INCOMPLETA', 0.15);

    if (p.motivos.includes('RESPUESTA_TRUNCADA')) c -= 0.3;
    if (p.motivos.includes('DOCUMENTO_RECORTADO')) c -= 0.2;
    if (p.motivos.includes('DOCUMENTO_ESCANEADO')) c -= 0.05;

    return Math.max(0, Math.round(c * 1000) / 1000);
  }

  /** Vista legible del documento (se muestra en el ERP y sirve de contexto compacto). */
  private generarMarkdown(
    tipo: TipoDocumentoBdt,
    d: ExtraccionDocumento,
    valores: ValorExtraido[],
    secciones: SeccionExtraida[],
    fechas: DocumentoExtraido['fechas'],
  ): string {
    const lineas: string[] = [];
    lineas.push(`# ${d.producto?.nombre || d.producto?.nombre_comercial || 'Producto'} — ${ETIQUETA_TIPO_DOCUMENTO[tipo]}`);
    const ident = [
      ['Fabricante', [d.fabricante?.nombre, d.fabricante?.pais].filter(Boolean).join(', ')],
      ['Proveedor', d.proveedor?.nombre],
      ['CAS', d.producto?.cas],
      ['INCI', d.producto?.inci],
      ['Fórmula', d.producto?.formula],
      ['Grado', d.producto?.grado],
      ['Presentación', d.lote?.presentacion || d.presentacion],
      ['Origen', d.lote?.pais_origen || d.pais_origen],
      ['Lote', d.lote?.numero],
      ['Emisión', fechas.emision],
      ['Revisión', fechas.revision],
      ['Fabricación', fechas.fabricacion],
      ['Análisis', fechas.analisis],
      ['Vencimiento', fechas.vencimiento],
      ['Sinónimos', (d.producto?.sinonimos ?? []).join(', ')],
    ].filter(([, v]) => v);
    if (ident.length) {
      lineas.push('', '## Identificación', ...ident.map(([k, v]) => `- **${k}:** ${v}`));
    }
    if (valores.length) {
      lineas.push('', '## Valores técnicos', '', '| Parámetro | Especificación | Resultado / Valor | Método |', '|---|---|---|---|');
      for (const v of valores) {
        const spec = v.naturaleza === 'ESPECIFICACION' ? v.valorTexto : v.especificacion;
        const res = v.naturaleza === 'ESPECIFICACION' ? '' : `${v.valorTexto ?? ''}${v.naturaleza === 'TIPICO' ? ' (típico)' : ''}`;
        lineas.push(`| ${v.nombreOriginal} | ${spec ?? ''} | ${res} | ${v.metodo ?? ''} |`);
      }
    }
    for (const s of secciones) {
      lineas.push('', `## ${s.titulo}`, s.contenidoEs);
    }
    if (d.observaciones) lineas.push('', `> Observaciones de la lectura: ${d.observaciones}`);
    return lineas.join('\n');
  }
}
