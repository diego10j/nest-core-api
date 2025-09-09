import { EventEmitter } from 'events';

import { Client, ClientInfo } from 'whatsapp-web.js';

export type WhatsAppStatus = 'disconnected' | 'authenticated' | 'ready' | 'qr' | 'loading' | 'unauthorized';
export type WhatsAppEvent = 'qr' | 'message' | 'ready' | 'disconnected' | 'auth_failure';

export interface MessageData {
  from: string;
  senderName: string;
  body: string;
  timestamp: number;
  isGroup: boolean;
  chatName: string | null;
  messageId: string;
  hasMedia: boolean;
}

export interface StatusResponse {
  status: WhatsAppStatus;
  isOnline: boolean;
  lastQr?: string;
  connectionAttempts: number;
  lastActivity?: Date;
  queueStatus?: {
    size: number;
    pending: number;
    isPaused: boolean;
  };
  info?: ClientInfo;
}
export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: string;
  // Agrega estas propiedades adicionales
  filename?: string; // Para documentos
  location?: {
    // Para ubicaciones
    latitude: number;
    longitude: number;
  };
  type?: string; // Para medios (image, video, etc.)
}

export interface WhatsAppClientInstance {
  client: Client;
  status: WhatsAppStatus;
  qrCode: string;
  lastActivity: Date | null;
  connectionAttempts: number;
  eventEmitter: EventEmitter;
}

export interface AccountConfig {
  id_cuenta_whcue: string;
  id_telefono_whcue: string;
  id_empr: number;
  nombre_whcue: string;
}
