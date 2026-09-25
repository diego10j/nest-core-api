import { Injectable } from '@nestjs/common';

import { BdtIaService, EntradaDocumentoIa } from './bdt-ia.service';
import {
  BDT_CONFIG,
  ETIQUETA_TIPO_DOCUMENTO,
  NATURALEZAS_VALOR_BDT,
  TipoDocumentoBdt,
} from './constants/base-tecnica.constants';
import { clasificarPorReglas } from './helpers/clasificador.helper';
import {
  esCasValido,
  esValorNumerico,
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
}

/**
 * Lee un archivo (PDF con texto, PDF escaneado o imagen) y devuelve su contenido técnico
 * estructurado. No toca la base de datos: la persistencia es de BdtProcesoService.
 */
@Injectable()
export class BdtExtraccionService {
  constructor(private readonly ia: BdtIaService) {}

  async extraer(
    archivo: ArchivoParaExtraer,
    contexto: { nombreProductoErp: string; clavesPropiedad: string[] },
  ): Promise<DocumentoExtraido> {
    const motivos: string[] = [];
    let paginas: PaginaTexto[] = [];
    let totalPaginas = 1;
    let esEscaneado = true;
    let entrada: EntradaDocumentoIa;

    if (archivo.extension === 'pdf') {
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
    const ia = await this.ia.extraerDocumento(prompt, entrada);
    const datos = ia.datos;

    // Escaneado: el "texto original" es la transcripción que hizo la IA.
    if (esEscaneado) {
      const transcripcion = datos.transcripcion_original?.trim() || '';
      paginas = [{ numero: 1, texto: transcripcion }];
      motivos.push('DOCUMENTO_ESCANEADO');
    }
    if (ia.truncado) motivos.push('RESPUESTA_TRUNCADA');

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
      nombreProductoErp: contexto.nombreProductoErp,
      motivos,
    });

    const textoOriginal = paginas.map((p) => `[Página ${p.numero}]\n${p.texto}`).join('\n\n');

    return {
      tipo,
      tipoFuente: reglas.tipo === tipo && reglas.certeza >= 0.5 ? 'REGLAS' : 'IA',
      idioma,
      metodo: esEscaneado ? 'VISION' : 'TEXTO',
      paginas: totalPaginas,
      textoOriginal,
      textoEs: esEspanol ? null : secciones.map((s) => `## ${s.titulo}\n${s.contenidoEs}`).join('\n\n') || null,
      markdown: this.generarMarkdown(tipo, datos, valores, secciones, fechas),
      datos,
      valores,
      secciones,
      fechas,
      confianza,
      motivosRevision: motivos,
      modelo: ia.modelo,
      tokensEntrada: ia.tokensEntrada,
      tokensSalida: ia.tokensSalida,
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
