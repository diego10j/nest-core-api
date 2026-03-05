// ─── Configuración almacenada en BD ─────────────────────────────────────────

export interface WhatsAppConfig {
  id_cuenta_whcue: string;  // phone_number_id de Meta
  id_token_whcue: string;   // Token de acceso permanente
  tipo_whcue: string;        // Siempre 'API'
}

// ─── Configuración en caché (Redis) ─────────────────────────────────────────

export interface CacheConfig {
  WHATSAPP_API_ID: string;    // phone_number_id
  WHATSAPP_API_TOKEN: string; // Bearer token
  WHATSAPP_TYPE: string;      // 'API'
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface MediaFile {
  url: string;
  mimeType: string;
  fileName: string;
  data?: any;
  fileSize?: any;
}

// ─── Webhooks Cloud API v20+ ─────────────────────────────────────────────────

export type WaMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'order'
  | 'system'
  | 'unknown'
  | 'reaction';

export interface WaInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: WaMessageType;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string; voice?: boolean };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string; sha256: string; animated: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
}

export interface WaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; error_data: { details: string } }>;
}

export interface WaWebhookValue {
  messaging_product: 'whatsapp';
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: WaInboundMessage[];
  statuses?: WaStatus[];
}

export interface WaWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{ value: WaWebhookValue; field: string }>;
  }>;
}

// ─── Respuesta de envío ───────────────────────────────────────────────────────

export interface WaSendResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

