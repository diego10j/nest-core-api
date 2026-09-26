import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

/** Notificación a entregar por un canal externo (hoy: Telegram). */
export interface NotificacionCanalEvent {
  ideNoti: number;
  ideEmpr: number;
  codigo: string;
  icono: string;
  titulo: string;
  mensaje: string;
  /** "Enviar prueba" desde la plantilla. */
  prueba?: boolean;
}

/**
 * Entrega de notificaciones por canales externos sin acoplar NotificacionesService a ellos: el
 * módulo de Telegram se suscribe aquí y envía a los números configurados en la plantilla.
 * Mismo patrón que ComprobanteAutorizadoEmitter.
 */
@Injectable()
export class NotificacionCanalEmitter extends EventEmitter {
  emitirTelegram(evento: NotificacionCanalEvent): void {
    this.emit('telegram', evento);
  }
}
