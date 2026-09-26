import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

export interface AlertaSistemaEvent {
  /** null = todas las empresas (ej. la cuenta de OpenAI es compartida). */
  ideEmpr: number | null;
  /** Código estable de la alerta (ej. IA_SIN_SALDO). */
  codigo: string;
  titulo: string;
  mensaje: string;
  nivel: 'INFO' | 'ADVERTENCIA' | 'CRITICA';
}

/**
 * Alertas del sistema para administradores (ej. OpenAI sin saldo). Quien las entregue por otro canal
 * (Telegram) se suscribe aquí, sin que el módulo que alerta dependa de él. Mismo patrón que
 * ComprobanteAutorizadoEmitter / ArchivoSubidoEmitter.
 */
@Injectable()
export class AlertaSistemaEmitter extends EventEmitter {
  emitir(alerta: AlertaSistemaEvent): void {
    this.emit('alerta', alerta);
  }
}
