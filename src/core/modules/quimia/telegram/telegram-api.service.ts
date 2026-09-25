import { Injectable } from '@nestjs/common';

export interface TelegramUsuario {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMensaje {
  message_id: number;
  from?: TelegramUsuario;
  chat: { id: number; type: string };
  text?: string;
  contact?: { phone_number: string; first_name?: string; user_id?: number };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMensaje;
  callback_query?: { id: string; from: TelegramUsuario; message?: TelegramMensaje; data?: string };
}

export interface BotonTelegram {
  text: string;
  url?: string;
  callback_data?: string;
}

/** Error de la API de Telegram (description = mensaje de Telegram, ej. "Unauthorized"). */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly codigo?: number,
  ) {
    super(message);
  }
}

/** Cliente mínimo de la Bot API de Telegram (https://core.telegram.org/bots/api). */
@Injectable()
export class TelegramApiService {
  async llamar<T>(token: string, metodo: string, body: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
      if (!data.ok) {
        throw new TelegramApiError(data.description || `Error HTTP ${res.status}`, data.error_code ?? res.status);
      }
      return data.result as T;
    } catch (error) {
      if (error instanceof TelegramApiError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new TelegramApiError(`Tiempo de espera agotado en ${metodo}`);
      throw new TelegramApiError((error as Error)?.message ?? 'No se pudo conectar con Telegram');
    } finally {
      clearTimeout(timer);
    }
  }

  getMe(token: string) {
    return this.llamar<TelegramUsuario>(token, 'getMe');
  }

  /** Long polling: espera hasta `espera` segundos por mensajes nuevos. */
  getUpdates(token: string, offset: number, espera = 25) {
    return this.llamar<TelegramUpdate[]>(
      token,
      'getUpdates',
      { offset, timeout: espera, allowed_updates: ['message', 'callback_query'] },
      (espera + 10) * 1000,
    );
  }

  setWebhook(token: string, url: string, secreto: string) {
    return this.llamar<boolean>(token, 'setWebhook', {
      url,
      secret_token: secreto,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
  }

  deleteWebhook(token: string) {
    return this.llamar<boolean>(token, 'deleteWebhook', { drop_pending_updates: false });
  }

  getWebhookInfo(token: string) {
    return this.llamar<{ url: string; pending_update_count: number; last_error_message?: string }>(token, 'getWebhookInfo');
  }

  enviarMensaje(
    token: string,
    chatId: number,
    texto: string,
    opciones: { html?: boolean; botones?: BotonTelegram[][]; teclado?: Record<string, unknown> } = {},
  ) {
    return this.llamar(token, 'sendMessage', {
      chat_id: chatId,
      text: texto,
      ...(opciones.html ? { parse_mode: 'HTML' } : {}),
      link_preview_options: { is_disabled: true },
      ...(opciones.botones?.length
        ? { reply_markup: { inline_keyboard: opciones.botones } }
        : opciones.teclado
          ? { reply_markup: opciones.teclado }
          : {}),
    });
  }

  escribiendo(token: string, chatId: number) {
    return this.llamar(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);
  }

  responderCallback(token: string, id: string, texto?: string) {
    return this.llamar(token, 'answerCallbackQuery', { callback_query_id: id, ...(texto ? { text: texto } : {}) }).catch(
      () => undefined,
    );
  }
}
