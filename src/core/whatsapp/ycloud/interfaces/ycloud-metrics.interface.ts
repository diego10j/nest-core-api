export interface DailyMetrics {
  fecha_whmed: string;
  mensajes_enviados: number;
  mensajes_recibidos: number;
  respuestas_dentro_24h: number;
  respuestas_fuera_24h: number;
  tiempo_respuesta_promedio_seg: number | null;
  chats_nuevos: number;
  chats_atendidos: number;
  templates_enviados: number;
  mensajes_fallidos: number;
}

export interface AgentMetrics {
  ide_usua_whmem: number;
  nom_usua: string;
  mensajes_enviados: number;
  tiempo_respuesta_promedio_seg: number | null;
  respuestas_dentro_24h: number;
  respuestas_fuera_24h: number;
}

export interface SyncLogEntry {
  ide_whysn: number;
  ide_empr: number;
  id_mensaje_whysn: string;
  tipo_operacion: string;
  payload_local: any;
  payload_ycloud: any;
  estado_sync: string;
  error_sync: string | null;
  hora_ingre: string;
  hora_sync: string | null;
}

export interface MessageSaveData {
  telefono: string;
  tipo: string;
  texto: string | null;
  idWts: string;
  mediaId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  ideUsua?: number;
  tiempoRespuesta?: number | null;
  contextMessageId?: string | null;
  /** true si lo envió el bot — false/undefined = lo envió un agente humano (API, WhatsApp Web, teléfono). */
  esBot?: boolean;
  /** true si es un envío de campaña masiva — no cuenta como "asesor tomó el chat" (no dispara el hand-off a ASESOR). */
  esCampania?: boolean;
}
