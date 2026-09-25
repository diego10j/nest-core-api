import {
  CLAVES_SECCION_BDT,
  NATURALEZAS_VALOR_BDT,
  TIPOS_DOCUMENTO_BDT,
} from '../constants/base-tecnica.constants';

/** Estructura que devuelve la IA (espejo de SCHEMA_EXTRACCION). */
export interface ExtraccionDocumento {
  tipo_documento: (typeof TIPOS_DOCUMENTO_BDT)[number];
  idioma: string;
  producto: {
    nombre: string | null;
    nombre_comercial: string | null;
    sinonimos: string[];
    cas: string | null;
    inci: string | null;
    formula: string | null;
    grado: string | null;
  };
  fabricante: {
    nombre: string | null;
    pais: string | null;
    ciudad: string | null;
    direccion: string | null;
    web: string | null;
    email: string | null;
    telefono: string | null;
  };
  proveedor: { nombre: string | null; pais: string | null };
  codigo_documento: string | null;
  fechas: {
    emision: string | null;
    revision: string | null;
    fabricacion: string | null;
    analisis: string | null;
    vencimiento: string | null;
  };
  fechas_encontradas: { etiqueta: string; valor_original: string; fecha: string | null }[];
  lote: {
    numero: string | null;
    pais_origen: string | null;
    presentacion: string | null;
    cumple: boolean | null;
  };
  presentacion: string | null;
  pais_origen: string | null;
  valores: {
    clave: string | null;
    nombre_original: string;
    naturaleza: (typeof NATURALEZAS_VALOR_BDT)[number];
    valor_texto: string | null;
    operador: string | null;
    valor_num: number | null;
    valor_min: number | null;
    valor_max: number | null;
    unidad: string | null;
    metodo: string | null;
    especificacion: string | null;
    pagina: number | null;
  }[];
  secciones: {
    clave: (typeof CLAVES_SECCION_BDT)[number];
    numero: number | null;
    titulo: string;
    contenido_es: string;
    pagina_desde: number | null;
    pagina_hasta: number | null;
  }[];
  /** Solo documentos escaneados/imágenes: transcripción del texto original. */
  transcripcion_original: string | null;
  observaciones: string | null;
}

const texto = { type: ['string', 'null'] };
const numero = { type: ['number', 'null'] };
const entero = { type: ['integer', 'null'] };

const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

/** JSON Schema estricto (Structured Outputs): la respuesta siempre trae todos los campos. */
export const SCHEMA_EXTRACCION = objeto({
  tipo_documento: { type: 'string', enum: [...TIPOS_DOCUMENTO_BDT] },
  idioma: { type: 'string', description: 'Código ISO 639-1 del idioma principal del documento: es, en, pt…' },
  producto: objeto({
    nombre: texto,
    nombre_comercial: texto,
    sinonimos: { type: 'array', items: { type: 'string' } },
    cas: texto,
    inci: texto,
    formula: texto,
    grado: texto,
  }),
  fabricante: objeto({
    nombre: texto,
    pais: texto,
    ciudad: texto,
    direccion: texto,
    web: texto,
    email: texto,
    telefono: texto,
  }),
  proveedor: objeto({ nombre: texto, pais: texto }),
  codigo_documento: texto,
  fechas: objeto({
    emision: texto,
    revision: texto,
    fabricacion: texto,
    analisis: texto,
    vencimiento: texto,
  }),
  fechas_encontradas: {
    type: 'array',
    items: objeto({ etiqueta: { type: 'string' }, valor_original: { type: 'string' }, fecha: texto }),
  },
  lote: objeto({
    numero: texto,
    pais_origen: texto,
    presentacion: texto,
    cumple: { type: ['boolean', 'null'] },
  }),
  presentacion: texto,
  pais_origen: texto,
  valores: {
    type: 'array',
    items: objeto({
      clave: texto,
      nombre_original: { type: 'string' },
      naturaleza: { type: 'string', enum: [...NATURALEZAS_VALOR_BDT] },
      valor_texto: texto,
      operador: { type: ['string', 'null'], description: "Uno de: '=', '>=', '<=', '>', '<', 'RANGO', 'TEXTO'" },
      valor_num: numero,
      valor_min: numero,
      valor_max: numero,
      unidad: texto,
      metodo: texto,
      especificacion: texto,
      pagina: entero,
    }),
  },
  secciones: {
    type: 'array',
    items: objeto({
      clave: { type: 'string', enum: [...CLAVES_SECCION_BDT] },
      numero: entero,
      titulo: { type: 'string' },
      contenido_es: { type: 'string' },
      pagina_desde: entero,
      pagina_hasta: entero,
    }),
  },
  transcripcion_original: texto,
  observaciones: texto,
});

export function buildPromptExtraccion(opts: {
  clavesPropiedad: string[];
  pistaTipo: string | null;
  nombreProductoErp: string;
  esEscaneado: boolean;
}): string {
  return `
Eres un especialista en documentación técnica de materias primas químicas (cosmética, alimentos,
farmacia, industria) para DIQUIMEC (Ecuador). Recibes UN documento de un proveedor y debes
clasificarlo y extraer su información en el JSON solicitado. Cada proveedor usa su propio formato:
ubica cada dato donde esté, sin asumir una plantilla.

PRODUCTO EN EL ERP AL QUE ESTÁ ADJUNTO: "${opts.nombreProductoErp}" (el documento puede usar otro
nombre comercial o estar en otro idioma; NO lo reemplaces, extrae el nombre tal como aparece).
${opts.pistaTipo ? `PISTA (clasificación por palabras clave, puede fallar): ${opts.pistaTipo}` : ''}

TIPO DE DOCUMENTO
- FICHA_TECNICA: Technical Data Sheet / Technical Information / Product Specification / ficha técnica.
  Describe el producto de un fabricante: especificaciones, propiedades típicas, aplicaciones.
- CERTIFICADO_ANALISIS: Certificate of Analysis / COA / certificado de análisis o calidad. Resultados
  de UN lote concreto (número de lote, fechas, resultados vs especificación).
- HOJA_SEGURIDAD: Safety Data Sheet / MSDS / SDS / hoja de datos de seguridad (secciones de seguridad).
- OTRO: cualquier otra cosa (factura, foto, catálogo comercial, carta, certificado kosher/halal…).

REGLAS DE EXTRACCIÓN
1. NUNCA inventes ni completes datos con tu conocimiento: solo lo que está escrito en el documento.
   Si un dato no aparece, usa null (o [] en listas).
2. Fechas en formato YYYY-MM-DD. En documentos en español/latinoamericanos, "13/3/2025" es día/mes/año.
   Si solo hay mes y año ("September 2007") usa el día 01. En "fechas_encontradas" lista TODAS las
   fechas con su etiqueta original ("Revision Date", "Fecha de elaboración"…) y en "fechas" asígnalas:
   emision, revision (típica de SDS), fabricacion y analisis (típicas de COA), vencimiento.
3. VALORES (propiedades medibles o especificadas: pureza/assay, pH, densidad, humedad, metales,
   microbiología, apariencia, color, olor, CAS, fórmula, peso molecular, vida útil, presentación, etc.):
   - nombre_original: exactamente como aparece ("Assay (as C6H8O7)", "pH (Directo, 25°C)").
   - clave: una de esta lista si corresponde, si no null: ${opts.clavesPropiedad.join(', ')}.
   - naturaleza: ESPECIFICACION (límite/rango garantizado), RESULTADO (valor medido en un lote, en COA),
     TIPICO (valor típico/orientativo de una ficha). En un COA cada análisis suele tener ambas: registra
     UNA fila con naturaleza RESULTADO, valor_texto = resultado y especificacion = el texto del límite.
   - valor_texto: el valor tal cual ("≥ 99.5 %", "Conforme", "5,61").
   - operador: '=', '>=', '<=', '>', '<', 'RANGO' (usa valor_min/valor_max) o 'TEXTO' (no numérico).
   - valor_num / valor_min / valor_max: números con punto decimal (5,61 → 5.61). Para un resultado
     numérico usa valor_num; para una especificación de rango usa valor_min y valor_max.
   - pagina: número de página (marcado como <<<PÁGINA n>>>).
4. SECCIONES: divide el contenido técnico útil en secciones (en una SDS, una por cada sección numerada
   1-16; en una ficha técnica: descripción, aplicaciones, funciones, dosificación, almacenamiento,
   empaque, estudios…). contenido_es: el contenido COMPLETO y FIEL de la sección EN ESPAÑOL (tradúcelo
   si el documento está en otro idioma; si ya está en español, cópialo corrigiendo solo saltos de línea).
   No resumas datos técnicos (números, dosis, condiciones); puedes omitir texto legal/publicitario
   repetitivo. Indica pagina_desde/pagina_hasta.
5. Presentación/empaque ("Bolsa 25 kg", "Tambor 200 L") en "presentacion" (y en lote.presentacion si
   el COA lo indica para ese lote). País de origen ("Country of origin", "Made in") en "pais_origen".
6. lote: solo en COA (número de lote/batch, país de origen, presentación, cumple = true si declara
   conformidad general "Complies"/"Conforme"/"Pass", false si declara no conforme, null si no dice).
7. fabricante = quien fabrica/emite el documento; proveedor = distribuidor si se menciona uno distinto.
8. producto.sinonimos: otros nombres que el documento da al producto (nombre químico, inglés, INCI,
   E-number…), sin repetir el nombre principal.
9. En "observaciones" anota brevemente problemas: texto ilegible, tabla dudosa, datos en otro documento
   ("specification available in separate document"), documento incompleto, etc.
${
  opts.esEscaneado
    ? '10. El documento es escaneado/imagen: en "transcripcion_original" transcribe TODO el texto visible en su idioma original, respetando filas de tablas con " | ".'
    : '10. "transcripcion_original": null (el texto ya fue extraído).'
}
`.trim();
}
