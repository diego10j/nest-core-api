import { Client } from "whatsapp-web.js";
import { EventEmitter } from 'events';

export type WhatsAppStatus = 'disconnected' | 'authenticated' | 'ready' | 'qr' | 'loading';
export type WhatsAppEvent = 'qr' | 'message' | 'ready' | 'disconnected' | 'auth_failure';

export interface MessageData {
    from: string;
    senderName: string;
    body: string;
    timestamp: number;
    isGroup: boolean;
    chatName: string | null;
    messageId: string;
    hasMedia : boolean
}

export interface StatusResponse {
    status: WhatsAppStatus;
    isOnline: boolean;
    lastQr?: string;
    connectionAttempts: number;
    lastActivity?: Date;
    queueStatus?: {
        size: number,
        pending: number,
        isPaused: boolean
    }
}
export interface SendMessageResponse {
    success: boolean;
    messageId?: string;
    error?: string;
    details?: string;
    // Agrega estas propiedades adicionales
    filename?: string;       // Para documentos
    location?: {            // Para ubicaciones
        latitude: number;
        longitude: number;
    };
    type?: string;     // Para medios (image, video, etc.)
}


export interface WhatsAppClientInstance {
    client: Client;
    status: WhatsAppStatus;
    qrCode: string;
    lastActivity: Date | null;
    connectionAttempts: number;
    eventEmitter: EventEmitter;
  }
  