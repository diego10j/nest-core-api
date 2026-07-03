import { Injectable } from '@nestjs/common';

/**
 * Serializa la ejecución de funciones async por chat (ide_whcha) — evita que dos
 * eventos del mismo chat (mensaje del cliente procesado por el bot, un agente humano
 * tomando el chat desde WhatsApp Web/teléfono o desde la API) se procesen en paralelo
 * y pisen el estado del otro (sesión de bot, banderas de wha_chat). Compartido entre
 * BotService y YcloudService para que ambos flujos se serialicen por la misma clave.
 *
 * Lock en memoria de proceso: válido mientras corra una sola instancia del backend
 * (confirmado para este despliegue) — no cubre múltiples instancias detrás de un
 * balanceador (haría falta Redis en ese caso).
 */
@Injectable()
export class ChatLockService {
  private readonly locks = new Map<number, Promise<void>>();

  async runExclusive<T>(ideWhcha: number, fn: () => Promise<T>): Promise<T> {
    const anterior = this.locks.get(ideWhcha) ?? Promise.resolve();
    const encolado = anterior.catch(() => undefined).then(fn);
    const marcador = encolado.then(() => undefined, () => undefined);
    this.locks.set(ideWhcha, marcador);
    try {
      return await encolado;
    } finally {
      if (this.locks.get(ideWhcha) === marcador) {
        this.locks.delete(ideWhcha);
      }
    }
  }
}
