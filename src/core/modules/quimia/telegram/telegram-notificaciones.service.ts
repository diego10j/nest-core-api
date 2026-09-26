import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { NotificacionCanalEmitter, NotificacionCanalEvent } from '../../sistema/notificaciones/notificacion-canal.emitter';

import { TelegramApiService } from './telegram-api.service';
import { TelegramCuentaService } from './telegram-cuenta.service';

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pausa entre mensajes: Telegram admite ~30 mensajes/s por bot; con esto nunca se acerca al límite. */
const PAUSA_MS = 60;

/**
 * Canal Telegram del esquema de notificaciones: cuando una plantilla con "Enviar por Telegram" se
 * dispara, envía el mensaje a los números autorizados elegidos en esa plantilla (activos y vinculados)
 * y registra cada envío en sis_notificacion_envio_tlg. Un fallo nunca afecta al proceso que notificó.
 */
@Injectable()
export class TelegramNotificacionesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramNotificacionesService.name);
  /** Entregas en orden (una notificación tras otra) para no competir por el límite de Telegram. */
  private cola: Promise<void> = Promise.resolve();
  private readonly oyente = (e: NotificacionCanalEvent) => {
    this.cola = this.cola
      .then(async () => {
        await this.entregar(e);
      })
      .catch((err) => this.logger.warn(`Notificación ${e.codigo} por Telegram: ${(err as Error).message}`));
  };

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly api: TelegramApiService,
    private readonly cuentas: TelegramCuentaService,
    private readonly canales: NotificacionCanalEmitter,
  ) {}

  onModuleInit() {
    this.canales.on('telegram', this.oyente);
  }

  onModuleDestroy() {
    this.canales.off('telegram', this.oyente);
  }

  async entregar(e: NotificacionCanalEvent): Promise<{ enviados: number; total: number }> {
    const r = await this.dataSource.pool.query(
      `SELECT u.ide_tlusu, u.ide_tlcue, u.alias_tlusu, u.chat_id_tlusu
         FROM sis_notificacion_telegram t
         JOIN tlg_usuario u ON u.ide_tlusu = t.ide_tlusu
         JOIN tlg_cuenta c ON c.ide_tlcue = u.ide_tlcue
        WHERE t.ide_noti = $1 AND u.activo_tlusu AND c.activo_tlcue AND c.ide_empr = $2`,
      [e.ideNoti, e.ideEmpr],
    );
    // Muchos títulos ya empiezan con su emoji ("💬 Cliente solicita asesor"): no se repite el ícono.
    const icono = /^\p{Extended_Pictographic}/u.test(e.titulo.trim()) ? '' : `${escapar(e.icono)} `;
    const texto = `${icono}<b>${escapar(e.titulo)}</b>${e.mensaje ? `\n\n${escapar(e.mensaje)}` : ''}`;
    const tokens = new Map<number, string>();
    let enviados = 0;

    for (const u of r.rows) {
      let estado = 'ENVIADO';
      let messageId: number | null = null;
      let error: string | null = null;
      if (!u.chat_id_tlusu) {
        estado = 'NO_VINCULADO';
        error = 'El número aún no abre el bot ni comparte su número';
      } else {
        try {
          if (!tokens.has(u.ide_tlcue)) tokens.set(u.ide_tlcue, (await this.cuentas.getCuentaInterna(u.ide_tlcue)).token);
          const m = await this.api.enviarMensaje(tokens.get(u.ide_tlcue), Number(u.chat_id_tlusu), texto, { html: true });
          messageId = (m as { message_id?: number })?.message_id ?? null;
          enviados++;
          await new Promise((res) => setTimeout(res, PAUSA_MS));
        } catch (err) {
          estado = 'ERROR';
          error = (err as Error).message;
        }
      }
      await this.dataSource.pool
        .query(
          `INSERT INTO sis_notificacion_envio_tlg (ide_noti, ide_tlusu, alias_netg, titulo_netg, estado_netg, prueba_netg,
                                                   message_id_netg, error_netg, ide_empr)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [e.ideNoti, u.ide_tlusu, u.alias_tlusu, e.titulo.slice(0, 200), estado, !!e.prueba, messageId, error, e.ideEmpr],
        )
        .catch((err) => this.logger.warn(`No se pudo registrar el envío: ${(err as Error).message}`));
    }
    if (r.rows.length) this.logger.log(`Notificación ${e.codigo}: ${enviados}/${r.rows.length} enviada(s) por Telegram`);
    return { enviados, total: r.rows.length };
  }
}
