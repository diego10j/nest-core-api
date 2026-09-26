import { CitaDocumento, DocumentoListado } from '../base-tecnica/bdt-consulta.service';

import { NotaQuimia } from './conocimiento/quimia-conocimiento.service';
import { ArchivoErpQuimia, ImagenProductoQuimia } from './erp/quimia-documentos-erp.service';

/** Canal por el que llega la pregunta (se registra en bdt_consulta.canal_bdcon). */
export type CanalQuimia = 'ASESOR' | 'API' | 'TELEGRAM';

export type ModoQuimia = 'AGENTE' | 'IA_GENERAL';

export interface ProductoQuimia {
  ide_inarti: number;
  nombre: string;
}

export interface ProductoCandidato extends ProductoQuimia {
  coincidencia: string;
  cobertura: number;
  similitud: number;
  /** Documentos técnicos procesados (0 = sin base técnica). */
  documentos: number;
}

/**
 * Eventos que emite el agente mientras responde. El chat web los recibe en streaming (NDJSON);
 * la API JSON (Telegram) los acumula en una RespuestaQuimia.
 */
export type EventoQuimia =
  | ({ tipo: 'producto' } & ProductoQuimia)
  | { tipo: 'seleccion'; opciones: ProductoCandidato[] }
  | { tipo: 'sugerir_cambio'; producto: ProductoCandidato }
  | { tipo: 'estado'; texto: string }
  | { tipo: 'delta'; texto: string }
  | { tipo: 'citas'; citas: CitaDocumento[] }
  | { tipo: 'documentos'; documentos: DocumentoListado[] }
  /** Notas de la base de conocimiento que coinciden (botones "Ver nota", máximo 5). */
  | { tipo: 'notas'; notas: NotaQuimia[] }
  /** PDF de factura/proforma pedidos (el chat los abre; Telegram los envía como archivo). */
  | { tipo: 'archivos'; archivos: ArchivoErpQuimia[] }
  /** Varias facturas/proformas con el mismo número: el usuario elige cuál (botones). */
  | { tipo: 'opciones_archivo'; archivos: ArchivoErpQuimia[] }
  /** Fotos de la galería del producto (máximo 5). */
  | { tipo: 'imagenes'; imagenes: ImagenProductoQuimia[] }
  | { tipo: 'sin_respuesta' }
  | { tipo: 'sin_producto' }
  | { tipo: 'aviso_ia' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin'; modo: string; ide_bdcon: number | null };

export type Emitir = (evento: EventoQuimia) => void;

/** Respuesta completa (API JSON / Telegram): todo lo que el chat web recibe por eventos. */
export interface RespuestaQuimia {
  texto: string;
  modo: string;
  producto: ProductoQuimia | null;
  citas: CitaDocumento[];
  documentos: DocumentoListado[];
  /** Notas de la base de conocimiento relacionadas (se ofrecen como "Ver nota"). */
  notas: NotaQuimia[];
  archivos: ArchivoErpQuimia[];
  /** Varias facturas/proformas con ese número para elegir. */
  opcionesArchivo: ArchivoErpQuimia[];
  imagenes: ImagenProductoQuimia[];
  /** El usuario debe elegir un producto (botones / teclado en línea de Telegram). */
  opciones: ProductoCandidato[];
  sugerirCambio: ProductoCandidato | null;
  /** La información no está disponible: se puede ofrecer la respuesta de IA general. */
  sinRespuesta: boolean;
  esIa: boolean;
  error: string | null;
  ide_bdcon: number | null;
  /** Texto plano listo para enviar por Telegram/WhatsApp (respuesta + fuentes + links). */
  textoPlano: string;
}

/** Quién pregunta por un canal externo (se guarda en bdt_consulta). */
export interface OrigenQuimia {
  telefono?: string | null;
  ide_tlusu?: number | null;
  /** Cómo llegó la pregunta (Telegram: texto o nota de voz transcrita). */
  entrada?: 'TEXTO' | 'AUDIO';
  ide_qmtra?: number | null;
}

/** Usuario del ERP en cuyo nombre se consulta (empresa, sucursal y login para auditoría). */
export interface UsuarioQuimia {
  ideEmpr: number;
  ideSucu: number;
  ideUsua: number;
  idePerf: number;
  login: string;
}
