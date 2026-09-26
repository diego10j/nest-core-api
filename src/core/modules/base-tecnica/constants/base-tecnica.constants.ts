export const TIPOS_DOCUMENTO_BDT = [
  'FICHA_TECNICA',
  'CERTIFICADO_ANALISIS',
  'HOJA_SEGURIDAD',
  'OTRO',
] as const;
export type TipoDocumentoBdt = (typeof TIPOS_DOCUMENTO_BDT)[number];

export const ETIQUETA_TIPO_DOCUMENTO: Record<string, string> = {
  FICHA_TECNICA: 'Ficha técnica',
  CERTIFICADO_ANALISIS: 'Certificado de análisis',
  HOJA_SEGURIDAD: 'Hoja de seguridad',
  OTRO: 'Otro documento',
  SIN_CLASIFICAR: 'Sin clasificar',
};

export const NATURALEZAS_VALOR_BDT = ['ESPECIFICACION', 'RESULTADO', 'TIPICO'] as const;

export const CLAVES_SECCION_BDT = [
  'IDENTIFICACION',
  'COMPOSICION',
  'PELIGROS',
  'PRIMEROS_AUXILIOS',
  'INCENDIOS',
  'DERRAMES',
  'MANIPULACION',
  'ALMACENAMIENTO',
  'EPP',
  'PROPIEDADES',
  'ESTABILIDAD',
  'TOXICOLOGIA',
  'ECOLOGIA',
  'DISPOSICION',
  'TRANSPORTE',
  'REGULATORIO',
  'APLICACIONES',
  'FUNCIONES',
  'DOSIFICACION',
  'ESPECIFICACIONES',
  'ANALISIS',
  'EMPAQUE',
  'ORIGEN',
  'ESTUDIOS',
  'OTRA',
] as const;

export const ESTADOS_DOCUMENTO_BDT = ['PENDIENTE', 'PROCESANDO', 'REVISION', 'APROBADO', 'RECHAZADO', 'ERROR'] as const;

/** Estados de documento que el chat usa como fuente (RECHAZADO / ERROR nunca). */
export const ESTADOS_FUENTE_CHAT = ['APROBADO', 'REVISION'];

export const BDT_CONFIG = {
  /** Subirla invalida todo lo extraído: el siguiente "Procesar" re-extrae aunque el hash no cambie. */
  VERSION_EXTRACTOR: 1,

  // gpt-4o-mini: la extracción es transcribir/estructurar lo que ya dice el documento, no razonar;
  // el modelo mini lo hace bien y cuesta ~15x menos que gpt-4o.
  MODELO_EXTRACCION: 'gpt-4o-mini',
  MODELO_CHAT: 'gpt-4o-mini',
  /** Agente QuimIA (elige y combina herramientas: base técnica, stock, precios, compras…). */
  MODELO_AGENTE: 'gpt-4o-mini',
  /** Máximo de vueltas herramienta→respuesta por pregunta (evita bucles y controla costo). */
  MAX_VUELTAS_AGENTE: 6,
  // Respuesta libre (sin documentos): aquí sí importa el criterio técnico del modelo.
  MODELO_IA_GENERAL: 'gpt-4o',
  /** Contenido de publicación del producto (redacción comercial a partir de la base técnica). */
  MODELO_CONTENIDO: 'gpt-4o',
  MAX_TOKENS_EXTRACCION: 16000,

  /** Menos caracteres por página que esto = página escaneada (imagen sin capa de texto). */
  MIN_CARACTERES_POR_PAGINA: 80,
  /** Tope de texto enviado a la extracción (~15k tokens). Lo que exceda se corta y va a REVISION. */
  MAX_CARACTERES_EXTRACCION: 60000,
  MAX_BYTES_ARCHIVO: 25 * 1024 * 1024,
  EXTENSIONES_SOPORTADAS: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as string[],

  /** Un documento en ERROR se reintenta en cada "Procesar" hasta este número; luego requiere forzar. */
  MAX_INTENTOS: 3,

  /** Archivos procesados en paralelo dentro de una corrida. */
  CONCURRENCIA: 2,

  /** Confianza calculada >= esto → APROBADO automático; menor → REVISION. */
  UMBRAL_APROBACION: 0.9,

  /** word_similarity mínimo para considerar que la pregunta menciona un producto. */
  UMBRAL_SIMILITUD_PRODUCTO: 0.45,
  /** Con un candidato >= este puntaje y ventaja >= MARGEN sobre el siguiente, se elige sin preguntar. */
  SIMILITUD_PRODUCTO_SEGURA: 0.75,
  MARGEN_PRODUCTO: 0.2,

  /** Contexto máximo de documentación enviado al chat (caracteres). */
  MAX_CONTEXTO_CHAT: 45000,
  MAX_SECCIONES_CHAT: 14,
  MAX_HISTORIAL_CHAT: 8,
} as const;

export const MENSAJE_IA_GENERAL =
  '⚠️ *Respuesta generada con IA: no proviene de la documentación técnica cargada al producto. ' +
  'Verifícala antes de compartirla con un cliente.*';
