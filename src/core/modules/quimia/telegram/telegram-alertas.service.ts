import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { AlertaSistemaEmitter, AlertaSistemaEvent } from '../../sistema/notificaciones/alerta-sistema.emitter';

import { TelegramApiService } from './telegram-api.service';
import { TelegramCuentaService } from './telegram-cuenta.service';

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Entrega por Telegram las alertas del sistema (ej. OpenAI sin saldo) a los números autorizados que
 * tienen "Recibe alertas del sistema" y ya vincularon su chat. Si falla un envío solo se registra en
 * el log: una alerta nunca debe romper el proceso que la generó.
 */
@Injectable()
export class TelegramAlertasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAlertasService.name);
  private readonly oyente = (a: AlertaSistemaEvent) => {
    this.enviar(a).catch((e) => this.logger.warn(`Alerta ${a.codigo} por Telegram: ${(e as Error).message}`));
  };

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly api: TelegramApiService,
    private readonly cuentas: TelegramCuentaService,
    private readonly alertas: AlertaSistemaEmitter,
  ) {}

  onModuleInit() {
    this.alertas.on('alerta', this.oyente);
  }

  onModuleDestroy() {
    this.alertas.off('alerta', this.oyente);
  }

  async enviar(a: AlertaSistemaEvent): Promise<number> {
    // Si la alerta ya tiene su plantilla con canal Telegram y números, la entrega el esquema de
    // notificaciones (NotificacionesService → TelegramNotificacionesService): aquí no se duplica.
    const plantilla = await this.dataSource.pool
      .query(
        `SELECT 1 FROM sis_notificacion n
          WHERE n.codigo_noti = $1 AND n.activo_noti AND n.telegram_activo_noti AND ($2::int IS NULL OR n.ide_empr = $2)
            AND EXISTS (SELECT 1 FROM sis_notificacion_telegram t WHERE t.ide_noti = n.ide_noti)`,
        [a.codigo, a.ideEmpr],
      )
      .catch(() => ({ rows: [] }));
    if (plantilla.rows.length) return 0;

    const r = await this.dataSource.pool.query(
      `SELECT u.ide_tlcue, u.chat_id_tlusu, u.alias_tlusu
         FROM tlg_usuario u
         JOIN tlg_cuenta c ON c.ide_tlcue = u.ide_tlcue
        WHERE c.activo_tlcue AND u.activo_tlusu AND u.recibe_alertas_tlusu AND u.chat_id_tlusu IS NOT NULL
          AND ($1::int IS NULL OR c.ide_empr = $1)`,
      [a.ideEmpr],
    );
    if (!r.rows.length) {
      this.logger.warn(`Alerta ${a.codigo}: ningún número de Telegram tiene "Recibe alertas del sistema"`);
      return 0;
    }
    const texto = `<b>${escapar(a.titulo)}</b>\n\n${escapar(a.mensaje)}`;
    const tokens = new Map<number, string>();
    let enviados = 0;
    for (const u of r.rows) {
      try {
        if (!tokens.has(u.ide_tlcue)) tokens.set(u.ide_tlcue, (await this.cuentas.getCuentaInterna(u.ide_tlcue)).token);
        await this.api.enviarMensaje(tokens.get(u.ide_tlcue), Number(u.chat_id_tlusu), texto, { html: true });
        enviados++;
      } catch (error) {
        this.logger.warn(`Alerta ${a.codigo} a ${u.alias_tlusu}: ${(error as Error).message}`);
      }
    }
    this.logger.log(`Alerta ${a.codigo} enviada por Telegram a ${enviados} número(s)`);
    return enviados;
  }
}
