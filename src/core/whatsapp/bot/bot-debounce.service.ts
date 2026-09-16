import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';

/**
 * Buffer de mensajes por chat para el modo mensajes reducidos (wha_bot_config.
 * reduce_mensajes_whbco) — agrupa ráfagas de mensajes seguidos del cliente y deja que
 * `BotScheduleService` (cron cada 5s) dispare el procesamiento real una sola vez, tras
 * `segundos_espera_whbco` de silencio, en vez de responder a cada mensaje individual.
 *
 * `PENDING_ZSET` es la cola de "chats con mensajes esperando": score = epoch ms del
 * último mensaje recibido (se reescribe en cada mensaje nuevo, reiniciando la espera).
 * `reclamarBuffer` hace el ZREM primero — el primer llamador que lo saca de la cola es el
 * único que procesa ese buffer, sin necesidad de un lock aparte si dos ticks del cron
 * corrieran superpuestos.
 */
@Injectable()
export class BotDebounceService {
  private static readonly PENDING_ZSET = 'bot:reducido:pending';

  constructor(private readonly dataSource: DataSourceService) {}

  private bufferKey(ideWhcha: number): string {
    return `bot:reducido:buffer:${ideWhcha}`;
  }

  private extensionKey(ideWhcha: number): string {
    return `bot:reducido:ext:${ideWhcha}`;
  }

  async encolarMensaje(ideWhcha: number, texto: string): Promise<void> {
    const redis = this.dataSource.redisClient;
    await redis.rpush(this.bufferKey(ideWhcha), texto);
    await redis.zadd(BotDebounceService.PENDING_ZSET, Date.now(), String(ideWhcha));
  }

  /** Último mensaje del buffer sin sacarlo de la cola (a diferencia de reclamarBuffer) — para
   * chequear si amerita extender la espera antes de decidir procesar. */
  async ultimoMensaje(ideWhcha: number): Promise<string | null> {
    const redis = this.dataSource.redisClient;
    const items = await redis.lrange(this.bufferKey(ideWhcha), -1, -1);
    return items[0] ?? null;
  }

  /**
   * Empuja el score del chat en PENDING_ZSET a "ahora" SIN tocar el buffer — reinicia el
   * conteo de `segundos_espera_whbco` para el próximo tick, igual que si acabara de llegar
   * un mensaje nuevo, pero sin que haya llegado uno. Usado cuando el último mensaje del
   * cliente avisa que viene más ("le envío los datos") — evita cerrar el paso (ej. finalizar
   * una cotización) justo antes de que lleguen los datos que anunció.
   */
  async extenderEspera(ideWhcha: number): Promise<void> {
    const redis = this.dataSource.redisClient;
    await redis.zadd(BotDebounceService.PENDING_ZSET, Date.now(), String(ideWhcha));
  }

  /**
   * Cuenta cuántas veces se extendió la espera para este chat en la ráfaga actual (TTL 5
   * min — se resetea solo entre conversaciones). Tope en el llamador para no posponer
   * indefinidamente si el cliente sigue escribiendo mensajes tipo "un momento".
   */
  async contarExtension(ideWhcha: number): Promise<number> {
    const redis = this.dataSource.redisClient;
    const key = this.extensionKey(ideWhcha);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 300);
    return count;
  }

  /**
   * Chats cuyo último mensaje tiene al menos `minEsperaSeg` de silencio — cota inferior
   * conservadora (el corte real, por `segundos_espera_whbco` de cada cuenta, se aplica
   * después con el timestamp que devuelve esta función).
   */
  async obtenerCandidatos(minEsperaSeg: number): Promise<{ ideWhcha: number; ultimoMensajeMs: number }[]> {
    const redis = this.dataSource.redisClient;
    const corte = Date.now() - minEsperaSeg * 1000;
    const rows = await redis.zrangebyscore(BotDebounceService.PENDING_ZSET, '-inf', corte, 'WITHSCORES');
    const result: { ideWhcha: number; ultimoMensajeMs: number }[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      result.push({ ideWhcha: Number(rows[i]), ultimoMensajeMs: Number(rows[i + 1]) });
    }
    return result;
  }

  /**
   * Saca el chat de la cola de pendientes y devuelve+limpia su buffer, en una sola pasada.
   * Devuelve [] si otro tick ya se lo llevó (ZREM no removió nada) o si no había buffer.
   */
  async reclamarBuffer(ideWhcha: number): Promise<string[]> {
    const redis = this.dataSource.redisClient;
    const removed = await redis.zrem(BotDebounceService.PENDING_ZSET, String(ideWhcha));
    if (!removed) return [];

    const key = this.bufferKey(ideWhcha);
    const textos = await redis.lrange(key, 0, -1);
    await redis.del(key);
    await redis.del(this.extensionKey(ideWhcha));
    return textos;
  }

  /** Descarta un buffer sin procesarlo (ej. un asesor tomó el chat mientras esperaba). */
  async descartar(ideWhcha: number): Promise<void> {
    const redis = this.dataSource.redisClient;
    await redis.zrem(BotDebounceService.PENDING_ZSET, String(ideWhcha));
    await redis.del(this.bufferKey(ideWhcha));
    await redis.del(this.extensionKey(ideWhcha));
  }
}
