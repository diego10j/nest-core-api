import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { TelegramApiService, TelegramUpdate } from './telegram-api.service';
import { TelegramBotService } from './telegram-bot.service';
import { CuentaTelegram, TelegramCuentaService, rutaWebhook } from './telegram-cuenta.service';

/**
 * Recepción de mensajes de Telegram según el modo de cada cuenta activa:
 * - POLLING: un bucle de long polling (getUpdates) por cuenta. No necesita URL pública.
 * - WEBHOOK: registra la URL pública (HOST_API) en Telegram; los mensajes llegan al controlador.
 *
 * Los updates de un mismo chat se procesan en orden (cola por chat); chats distintos en paralelo,
 * así una consulta lenta de un usuario no bloquea a los demás.
 *
 * IMPORTANTE: con varias instancias del backend (pm2 cluster, réplicas) usar WEBHOOK: Telegram no
 * permite dos getUpdates simultáneos del mismo bot (error 409 Conflict).
 */
@Injectable()
export class TelegramRunnerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramRunnerService.name);
  private readonly bucles = new Map<number, { activo: boolean }>();
  private readonly colasPorChat = new Map<string, Promise<void>>();

  constructor(
    private readonly cuentas: TelegramCuentaService,
    private readonly api: TelegramApiService,
    private readonly bot: TelegramBotService,
  ) {
    this.cuentas.onCuentaCambiada = (ide) => this.aplicarCuenta(ide);
  }

  async onApplicationBootstrap() {
    // Sin las tablas (script aún no ejecutado) el resto del ERP debe arrancar igual.
    try {
      const activas = await this.cuentas.getCuentasActivas();
      for (const c of activas) await this.aplicarCuenta(c.ide_tlcue).catch((e) => this.logger.warn(e.message));
    } catch (error) {
      this.logger.warn(`Telegram no iniciado: ${(error as Error).message}`);
    }
  }

  onModuleDestroy() {
    this.bucles.forEach((b) => (b.activo = false));
  }

  /** Aplica la configuración guardada: inicia/detiene polling y registra/quita el webhook. */
  async aplicarCuenta(ideTlcue: number) {
    this.detenerPolling(ideTlcue);
    const cuenta = await this.cuentas.getCuentaInterna(ideTlcue);
    if (!cuenta.token) throw new Error('La cuenta no tiene token');

    if (!cuenta.activo_tlcue) {
      await this.api.deleteWebhook(cuenta.token).catch(() => undefined);
      return;
    }
    if (cuenta.modo_tlcue === 'WEBHOOK') {
      const url = rutaWebhook(cuenta.ide_tlcue, cuenta.url_publica_tlcue);
      if (!url.startsWith('https://')) {
        const msg =
          `Telegram exige HTTPS para el webhook y la URL pública es ${url.split('/api/')[0]}. ` +
          'Configura la "URL pública del backend" (el mismo dominio https del webhook de YCloud) o usa POLLING.';
        await this.cuentas.registrarError(ideTlcue, msg);
        throw new Error(msg);
      }
      await this.api.setWebhook(cuenta.token, url, cuenta.webhook_secret_tlcue);
      await this.cuentas.registrarError(ideTlcue, null);
      this.logger.log(`Telegram @${cuenta.bot_username_tlcue}: webhook ${url}`);
      return;
    }
    // POLLING: getUpdates no funciona si hay un webhook registrado.
    await this.api.deleteWebhook(cuenta.token);
    this.iniciarPolling(cuenta);
  }

  private detenerPolling(ideTlcue: number) {
    const b = this.bucles.get(ideTlcue);
    if (b) b.activo = false;
    this.bucles.delete(ideTlcue);
  }

  private iniciarPolling(cuenta: CuentaTelegram) {
    const control = { activo: true };
    this.bucles.set(cuenta.ide_tlcue, control);
    this.logger.log(`Telegram @${cuenta.bot_username_tlcue}: polling iniciado`);

    let offset = cuenta.ultimo_update_tlcue ? cuenta.ultimo_update_tlcue + 1 : 0;
    let errores = 0;
    const bucle = async () => {
      while (control.activo) {
        try {
          const updates = await this.api.getUpdates(cuenta.token, offset, 25);
          if (!control.activo) break;
          if (errores) await this.cuentas.registrarError(cuenta.ide_tlcue, null);
          errores = 0;
          for (const u of updates) {
            offset = u.update_id + 1;
            this.encolar(cuenta, u);
          }
          if (updates.length) await this.cuentas.guardarOffset(cuenta.ide_tlcue, offset - 1);
        } catch (error) {
          errores++;
          const msg = (error as Error).message;
          this.logger.warn(`Telegram polling (${cuenta.bot_username_tlcue}): ${msg}`);
          if (errores === 1 || errores % 20 === 0) await this.cuentas.registrarError(cuenta.ide_tlcue, msg).catch(() => undefined);
          // 409 = otra instancia hace polling o hay webhook; 401 = token revocado.
          await new Promise((r) => setTimeout(r, Math.min(60_000, 2_000 * errores)));
        }
      }
      this.logger.log(`Telegram @${cuenta.bot_username_tlcue}: polling detenido`);
    };
    void bucle();
  }

  /** Webhook: valida el secreto y encola el update (la respuesta HTTP no espera a la IA). */
  async recibirWebhook(ideTlcue: number, secreto: string | undefined, update: TelegramUpdate): Promise<boolean> {
    const cuenta = await this.cuentas.getCuentaInterna(ideTlcue).catch(() => null);
    if (!cuenta || !cuenta.activo_tlcue || !secreto || secreto !== cuenta.webhook_secret_tlcue) return false;
    this.encolar(cuenta, update);
    return true;
  }

  private encolar(cuenta: CuentaTelegram, update: TelegramUpdate) {
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? 0;
    const clave = `${cuenta.ide_tlcue}:${chatId}`;
    const anterior = this.colasPorChat.get(clave) ?? Promise.resolve();
    const siguiente = anterior.then(() => this.bot.procesarUpdate(cuenta, update));
    this.colasPorChat.set(clave, siguiente);
    void siguiente.finally(() => {
      if (this.colasPorChat.get(clave) === siguiente) this.colasPorChat.delete(clave);
    });
  }
}
