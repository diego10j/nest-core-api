export interface WhatsAppConfig {
  id_cuenta_whcue: string;
  id_token_whcue: string;
  tipo_whcue: string;
}

export interface CacheConfig {
  WHATSAPP_API_ID: string;
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_TYPE: string;
}

export interface MediaFile {
  url: string;
  mimeType: string;
  fileName: string;
  data?: any;
  fileSize?: any;
}
