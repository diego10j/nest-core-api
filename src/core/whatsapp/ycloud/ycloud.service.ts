import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { isDefined } from 'class-validator';
import FormData from 'form-data';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { BotConfigService } from '../bot/bot-config.service';
import { WhatsappGateway } from '../whatsapp.gateway';

import { YcloudSendResponse, YcloudUploadResponse } from './interfaces/ycloud-api-response.interface';
import { YcloudCacheConfig, YcloudDbConfig } from './interfaces/ycloud-config.interface';
import {
  YcloudDocumentPayload,
  YcloudImagePayload,
  YcloudInboundMessage,
  YcloudMessagePayload,
  YcloudStatusData,
  YcloudTemplatePayload,
  YcloudTextPayload,
} from './interfaces/ycloud-message.interface';
import { MessageSaveData } from './interfaces/ycloud-metrics.interface';
import { YcloudWebhookPayload } from './interfaces/ycloud-webhook.interface';
import { YcloudMetricsService } from './ycloud-metrics.service';
import { YcloudWindowService } from './ycloud-window.service';

type InboundMessageHandler = (
  waId: string, phoneNumberId: string, ideWhcha: number,
  ideWhcue: number, ideEmpr: number, texto: string, botActivo: boolean,
) => Promise<void>;

@Injectable()
export class YcloudService {
  private readonly YCLOUD_API_URL: string;
  private readonly YCLOUD_API_KEY: string;
  private readonly logger = new Logger(YcloudService.name);
  private messageHandler: InboundMessageHandler | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly dataSource: DataSourceService,
    private readonly whatsappGateway: WhatsappGateway,
    private readonly windowService: YcloudWindowService,
    private readonly metricsService: YcloudMetricsService,
    private readonly botConfig: BotConfigService,
  ) {
    this.YCLOUD_API_URL = (envs.ycloudApiUrl || 'https://api.ycloud.com/v2').trim();
    this.YCLOUD_API_KEY = (envs.ycloudApiKey || '').trim();
    this.logger.log(`YCloud API KEY length: ${this.YCLOUD_API_KEY.length} | URL: ${this.YCLOUD_API_URL}`);
  }

  setMessageHandler(handler: InboundMessageHandler): void {
    this.messageHandler = handler;
  }

  // ─── Config ───────────────────────────────────────────────────

  async getConfig(ideEmpr: number): Promise<YcloudCacheConfig> {
    const cacheKey = `ycloud_config:${ideEmpr}`;
    let data = await this.getFromCache(cacheKey);
    if (!data) {
      data = await this.fetchConfigFromDatabase(ideEmpr);
      if (data) {
        await this.setToCache(cacheKey, data);
      } else {
        throw new BadRequestException('No existe configuracion YCloud para esta empresa');
      }
    }
    return {
      apiKey: data.id_token_whcue || this.YCLOUD_API_KEY,
      phoneNumberId: data.id_cuenta_whcue,
      businessId: undefined,
      displayPhoneNumber: data.id_telefono_whcue,
    };
  }

  private async getFromCache(cacheKey: string): Promise<YcloudDbConfig | null> {
    const dataConfig = await this.dataSource.redisClient.get(cacheKey);
    return dataConfig ? JSON.parse(dataConfig) : null;
  }

  private async setToCache(cacheKey: string, data: YcloudDbConfig): Promise<void> {
    await this.dataSource.redisClient.set(cacheKey, JSON.stringify(data));
  }

  private async fetchConfigFromDatabase(ideEmpr: number): Promise<YcloudDbConfig | null> {
    const query = new SelectQuery(`
      SELECT
        id_cuenta_whcue,
        id_token_whcue,
        id_telefono_whcue
      FROM wha_cuenta
      WHERE ide_empr = $1
        AND tipo_whcue = 'YCLOUD'
        AND activo_whcue = TRUE
      LIMIT 1
    `);
    query.addIntParam(1, ideEmpr);
    const data = await this.dataSource.createSingleQuery(query);
    return data || null;
  }

  private async assertConfig(ideEmpr: number): Promise<YcloudCacheConfig> {
    const config = await this.getConfig(ideEmpr);
    if (!isDefined(config) || !config.apiKey) {
      throw new BadRequestException('Error al obtener la configuracion YCloud');
    }
    return config;
  }

  // ─── HTTP Helpers ──────────────────────────────────────────────

  private buildAuthHeaders(): AxiosRequestConfig {
    return {
      headers: {
        'X-API-Key': this.YCLOUD_API_KEY,
        'Content-Type': 'application/json',
      },
    };
  }

  private async apiPost(path: string, data: any): Promise<any> {
    const url = `${this.YCLOUD_API_URL}${path}`;
    const config = this.buildAuthHeaders();
    try {
      const resp = await this.httpService.axiosRef.post(url, data, config);
      return resp.data;
    } catch (error) {
      this.logger.error(`YCloud POST ${path} error: ${error.response?.data || error.message}`);
      throw new InternalServerErrorException(
        `[YCloud API Error] ${JSON.stringify(error.response?.data || error.message)}`,
      );
    }
  }

  private async apiGet(path: string): Promise<any> {
    const url = `${this.YCLOUD_API_URL}${path}`;
    const config = this.buildAuthHeaders();
    try {
      const resp = await this.httpService.axiosRef.get(url, config);
      return resp.data;
    } catch (error) {
      this.logger.error(`YCloud GET ${path} error: ${error.response?.data || error.message}`);
      throw new InternalServerErrorException(
        `[YCloud API Error] ${JSON.stringify(error.response?.data || error.message)}`,
      );
    }
  }

  private async apiPostFormData(path: string, formData: FormData): Promise<any> {
    const url = `${this.YCLOUD_API_URL}${path}`;
    const config: AxiosRequestConfig = {
      headers: {
        'X-API-Key': this.YCLOUD_API_KEY,
        ...formData.getHeaders(),
      },
    };
    try {
      const resp = await this.httpService.axiosRef.post(url, formData, config);
      return resp.data;
    } catch (error) {
      const errData = error.response?.data;
      this.logger.error(`YCloud POST form-data ${path} error: ${JSON.stringify(errData ?? error.message)}`);
      throw new InternalServerErrorException(
        `[YCloud API Error] ${JSON.stringify(errData ?? error.message)}`,
      );
    }
  }

  // ─── Send Messages ────────────────────────────────────────────

  async sendText(
    ideEmpr: number,
    to: string,
    body: string,
    ideUsua?: number,
    contextMessageId?: string,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const windowCheck = await this.windowService.canSendFreeMessage(config.phoneNumberId, to);
    if (!windowCheck.allowed) {
      throw new BadRequestException(windowCheck.reason);
    }

    const payload: YcloudTextPayload & { context?: { message_id: string } } = {
      from: config.displayPhoneNumber,
      to,
      type: 'text',
      text: { body, preview_url: false },
    };
    if (contextMessageId) {
      payload.context = { message_id: contextMessageId };
    }

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono: to,
        tipo: 'text',
        texto: body,
        idWts: messageId,
        ideUsua,
        tiempoRespuesta: windowCheck.lastInbound
          ? Math.floor((Date.now() - windowCheck.lastInbound.getTime()) / 1000)
          : null,
        contextMessageId: contextMessageId || null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async sendTemplate(
    ideEmpr: number,
    to: string,
    name: string,
    language: string,
    components?: Record<string, any>[],
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const payload: YcloudTemplatePayload = {
      from: config.displayPhoneNumber,
      to,
      type: 'template',
      template: {
        name,
        language: { code: language },
        components: components as any,
      },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono: to,
        tipo: 'template',
        texto: `Template: ${name}`,
        idWts: messageId,
        ideUsua,
        tiempoRespuesta: null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async sendImage(
    ideEmpr: number,
    to: string,
    mediaId: string,
    caption?: string,
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const windowCheck = await this.windowService.canSendFreeMessage(config.phoneNumberId, to);
    if (!windowCheck.allowed) {
      throw new BadRequestException(windowCheck.reason);
    }

    const payload: YcloudImagePayload = {
      from: config.displayPhoneNumber,
      to,
      type: 'image',
      image: { id: mediaId, caption },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono: to,
        tipo: 'image',
        texto: caption || null,
        idWts: messageId,
        mediaId,
        ideUsua,
        tiempoRespuesta: windowCheck.lastInbound
          ? Math.floor((Date.now() - windowCheck.lastInbound.getTime()) / 1000)
          : null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async sendVideo(
    ideEmpr: number,
    to: string,
    mediaId: string,
    caption?: string,
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const windowCheck = await this.windowService.canSendFreeMessage(config.phoneNumberId, to);
    if (!windowCheck.allowed) {
      throw new BadRequestException(windowCheck.reason);
    }

    const payload: YcloudMessagePayload = {
      to,
      type: 'video',
      video: { id: mediaId, caption },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono: to,
        tipo: 'video',
        texto: caption || null,
        idWts: messageId,
        mediaId,
        ideUsua,
        tiempoRespuesta: windowCheck.lastInbound
          ? Math.floor((Date.now() - windowCheck.lastInbound.getTime()) / 1000)
          : null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async sendAudio(
    ideEmpr: number,
    to: string,
    mediaId: string,
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const windowCheck = await this.windowService.canSendFreeMessage(config.phoneNumberId, to);
    if (!windowCheck.allowed) {
      throw new BadRequestException(windowCheck.reason);
    }

    const payload: YcloudMessagePayload = {
      from: config.displayPhoneNumber,
      to,
      type: 'audio',
      audio: { id: mediaId },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono: to,
        tipo: 'audio',
        texto: null,
        idWts: messageId,
        mediaId,
        ideUsua,
        tiempoRespuesta: windowCheck.lastInbound
          ? Math.floor((Date.now() - windowCheck.lastInbound.getTime()) / 1000)
          : null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async sendDocument(
    ideEmpr: number,
    to: string,
    mediaId: string | null,
    filename: string,
    caption?: string,
    ideUsua?: number,
    link?: string,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const windowCheck = await this.windowService.canSendFreeMessage(config.phoneNumberId, to);
    if (!windowCheck.allowed) {
      throw new BadRequestException(windowCheck.reason);
    }

    const docField = link
      ? { link, filename, caption }
      : { id: mediaId, filename, caption };

    const payload: YcloudDocumentPayload = {
      from: config.displayPhoneNumber,
      to,
      type: 'document',
      document: docField as any,
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono: to,
        tipo: 'document',
        texto: caption || null,
        idWts: messageId,
        mediaId,
        fileName: filename,
        ideUsua,
        tiempoRespuesta: windowCheck.lastInbound
          ? Math.floor((Date.now() - windowCheck.lastInbound.getTime()) / 1000)
          : null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async sendTemplateWithDocument(
    ideEmpr: number,
    to: string,
    templateName: string,
    language: string,
    docMediaId: string,
    filename: string,
    components?: Record<string, any>[],
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const mergedComponents = components || [];
    const hasHeaderDoc = mergedComponents.some(
      (c) => c.type === 'header' && c.parameters?.some((p: any) => p.type === 'document'),
    );

    if (!hasHeaderDoc) {
      mergedComponents.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: { id: docMediaId, filename },
          },
        ],
      });
    }

    const payload: YcloudTemplatePayload = {
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: mergedComponents as any,
      },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono: to,
        tipo: 'template',
        texto: `Template: ${templateName} + doc: ${filename}`,
        idWts: messageId,
        mediaId: docMediaId,
        fileName: filename,
        ideUsua,
        tiempoRespuesta: null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async sendInteractiveList(
    ideEmpr: number,
    to: string,
    body: string,
    buttonLabel: string,
    rows: { id: string; title: string; description?: string }[],
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const payload = {
      from: config.displayPhoneNumber,
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonLabel,
          sections: [{ rows: rows.map((r) => ({ id: r.id, title: r.title.substring(0, 24), description: r.description?.substring(0, 72) })) }],
        },
      },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;
    await this.saveMessageSent(
      { telefono: to, tipo: 'interactive', texto: body, idWts: messageId, tiempoRespuesta: null },
      config,
    );
    return { messageId };
  }

  async sendInteractiveButtons(
    ideEmpr: number,
    to: string,
    body: string,
    buttons: { id: string; title: string }[],
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const payload = {
      from: config.displayPhoneNumber,
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      { telefono: to, tipo: 'interactive', texto: body, idWts: messageId, tiempoRespuesta: null },
      config,
    );

    return { messageId };
  }

  async sendLocation(
    ideEmpr: number,
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const payload = {
      from: config.displayPhoneNumber,
      to,
      type: 'location',
      location: { latitude, longitude, name, address },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      { telefono: to, tipo: 'location', texto: name || 'Ubicación', idWts: messageId, tiempoRespuesta: null },
      config,
    );
    return { messageId };
  }

  // ─── Historial de mensajes (para detección de chat nuevo) ─────

  /**
   * Consulta la API de YCloud para determinar si un número de teléfono
   * ha enviado mensajes previamente. Se usa para detectar chats genuinamente nuevos
   * incluso cuando la BD local fue purgada o no tiene registros.
   */
  async hasPriorMessages(phoneNumber: string): Promise<boolean> {
    // YCloud espera el número en formato E.164 con "+" — el resto de llamadas a su API
    // en este servicio siempre lo mandan así (ver sendText/saveMessageSent). Si llega
    // sin "+" (ej. el waId derivado del webhook, que se guarda sin el prefijo), la
    // consulta puede no matchear y devolver falsos negativos (chat tratado como nuevo
    // aunque sí tenga historial).
    const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    try {
      const resp = await this.apiGet(
        `/whatsapp/messages?phoneNumber=${encodeURIComponent(normalized)}&limit=1`,
      );
      const data = resp?.data ?? resp;
      const messages = Array.isArray(data) ? data : (data?.messages ?? []);
      const tienePrevios = messages.length > 0;
      this.logger.debug(`[hasPriorMessages] phoneNumber=${normalized} → ${messages.length} mensaje(s)`);
      return tienePrevios;
    } catch (err) {
      // Si la API falla, asumimos que NO es nuevo (conservador: no responder por error)
      this.logger.warn(`[hasPriorMessages] error consultando ${normalized}: ${err.message} — se asume que SÍ tiene historial`);
      return true;
    }
  }

  // ─── Geocodificación inversa ──────────────────────────────────

  async getAddressFromCoords(lat: number, lng: number): Promise<string | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`;
      const resp = await this.httpService.axiosRef.get(url, {
        headers: { 'User-Agent': 'DIQUIMEC-WhatsApp-Bot/1.0' },
        timeout: 5000,
      });
      const addr = resp.data?.address;
      if (!addr) return resp.data?.display_name || null;
      const partes = [
        addr.road || addr.pedestrian || addr.footway,
        addr.house_number,
        addr.suburb || addr.neighbourhood,
        addr.city || addr.town || addr.village || addr.county,
      ].filter(Boolean);
      return partes.length ? partes.join(', ') : resp.data?.display_name || null;
    } catch {
      return null;
    }
  }

  // ─── Media ────────────────────────────────────────────────────

  async uploadMedia(
    ideEmpr: number,
    file: Buffer,
    mimeType: string,
    filename?: string,
  ): Promise<{ mediaId: string }> {
    await this.assertConfig(ideEmpr);

    const formData = new FormData();
    formData.append('file', file, {
      filename: filename || 'file',
      contentType: mimeType,
    });
    formData.append('messaging_product', 'whatsapp');

    const resp: YcloudUploadResponse = await this.apiPostFormData('/whatsapp/media', formData);
    return { mediaId: resp.id };
  }

  private extractInboxKey(link?: string): string | null {
    if (!link) return null;
    // URL: https://static-internal.ycloud.com/.../2026/06/24/{inboxKey}.pdf?Expires=...
    const match = link.match(/\/([a-f0-9]{32})\.[a-z0-9]+\?/i);
    return match ? match[1] : null;
  }

  async downloadMedia(mediaId: string, phoneNumberId?: string): Promise<Buffer> {
    const params: Record<string, string> = {};
    if (phoneNumberId) params['phoneNumber'] = phoneNumberId;

    const url = `${this.YCLOUD_API_URL}/whatsapp/media/${mediaId}`;
    this.logger.debug(`Descargando media: ${url} | phone: ${phoneNumberId || 'N/A'} | keyLen: ${this.YCLOUD_API_KEY.length}`);

    const config: AxiosRequestConfig = {
      responseType: 'arraybuffer',
      headers: { 'X-API-Key': this.YCLOUD_API_KEY },
      params,
      timeout: 30000,
    };
    try {
      const response = await this.httpService.axiosRef.get(url, config);
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      this.logger.error(`YCloud download media error [${mediaId}]: ${JSON.stringify(error.response?.data || error.message)}`);
      throw new InternalServerErrorException('Error al descargar archivo de YCloud');
    }
  }

  // ─── Webhook ──────────────────────────────────────────────────

  async handleWebhook(payload: YcloudWebhookPayload): Promise<void> {
    switch (payload.type) {
      case 'whatsapp.inbound_message.received':
        if (payload.whatsappInboundMessage) {
          await this.processInboundMessage(payload.whatsappInboundMessage);
        }
        break;
      case 'whatsapp.message.updated':
        if (payload.whatsappMessage) {
          await this.processStatusUpdate(payload.whatsappMessage as YcloudStatusData);
        }
        break;
      case 'whatsapp.template.category_updated':
      case 'whatsapp.template.quality_updated':
      case 'whatsapp.template.reviewed':
        await this.processTemplateResponse(payload as Record<string, any>);
        break;
      case 'contact.created':
      case 'contact.attributes_changed':
        await this.processContactEvent(payload.contact || (payload as Record<string, any>));
        break;
      case 'whatsapp.smb.message.echoes':
        // Mensaje enviado desde WhatsApp Web / App nativa (fuera de nuestra API).
        // El agente vio y respondió el chat → reseteamos no_leidos_whcha.
        if (payload.whatsappMessage) {
          await this.processEchoMessage(payload.whatsappMessage);
        }
        break;
      default:
        this.logger.debug(`Evento YCloud no procesado (${payload.type})`);
        break;
    }
  }

  private async processInboundMessage(data: YcloudInboundMessage): Promise<void> {
    try {
      const waId = data.from.replace(/^\+/, '');
      const phoneNumberId = data.to.replace(/^\+/, '');
      const profileName = data.customerProfile?.name || null;
      // Usar la hora real del mensaje (sendTime de YCloud), no la hora de procesamiento.
      // Si YCloud reintenta el webhook horas después, el mensaje se guarda con su hora original.
      const msgDate = data.sendTime ? new Date(data.sendTime) : new Date();

      const ideWhcha = await this.upsertChat({
        waId,
        phoneNumberId,
        phoneNumberFrom: data.from,
        profileName,
        now: msgDate,
        isInbound: true,
      });

      const esNuevo = await this.insertMensajeInbound(data, waId, phoneNumberId, ideWhcha, msgDate);
      if (!esNuevo) {
        // YCloud reintentó el webhook para un mensaje ya procesado (mismo wamid) —
        // no volver a invocar el bot ni las notificaciones, o se duplican las respuestas.
        this.logger.debug(`[Bot-diag] wamid duplicado (${data.wamid || data.id}) — se omite reprocesamiento`);
        return;
      }
      await this.windowService.registerInboundMessage(waId, phoneNumberId);
      this.whatsappGateway.sendMessageToClients(waId);
      void this.emitTotalNoLeidos(phoneNumberId);

      const textoBot = data.text?.body
        || data.button?.payload
        || data.interactive?.button_reply?.id
        || data.interactive?.buttonReply?.id
        || data.interactive?.list_reply?.id
        || data.interactive?.listReply?.id
        || (data.location
            ? `__LOCATION__:${data.location.latitude},${data.location.longitude},${data.location.name || ''},${data.location.address || ''}`
            : '')
        || '';

      this.logger.debug(`[Bot-diag] ideWhcha=${ideWhcha} phoneNumberId=${phoneNumberId} textoBot="${textoBot}" handlerSet=${!!this.messageHandler}`);

      if (textoBot) {
        const infoRow = await this.dataSource.pool.query<{
          ide_empr: number; ide_whcue: number; bot_activo_whcha: boolean;
        }>(
          `SELECT cu.ide_empr, cu.ide_whcue, c.bot_activo_whcha
           FROM wha_chat c
           INNER JOIN wha_cuenta cu
             ON REPLACE(cu.id_telefono_whcue, '+', '') = $2
            AND cu.activo_whcue = TRUE
           WHERE c.ide_whcha = $1
           LIMIT 1`,
          [ideWhcha, phoneNumberId],
        );

        this.logger.debug(`[Bot-diag] infoRow.rowCount=${infoRow.rowCount} | data=${JSON.stringify(infoRow.rows[0] ?? null)}`);

        if (infoRow.rowCount > 0) {
          const { ide_empr: ideEmpr, ide_whcue: ideWhcue, bot_activo_whcha } = infoRow.rows[0];
          if (this.messageHandler) {
            this.messageHandler(
              waId, phoneNumberId, ideWhcha, ideWhcue, ideEmpr, textoBot, bot_activo_whcha !== false,
            ).catch((err) => this.logger.error(`Bot error: ${err.message}`));
          } else {
            this.logger.warn(`[Bot-diag] messageHandler no registrado — bot no puede responder`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error processing inbound message: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async upsertChat(opts: {
    waId: string;
    phoneNumberId: string;
    phoneNumberFrom: string;
    profileName: string | null;
    now: Date;
    isInbound: boolean;
  }): Promise<number> {
    const { waId, phoneNumberId, phoneNumberFrom, profileName, now, isInbound } = opts;

    // bot_activo_whcha inicial de un chat nuevo: replica la misma regla que gobierna el
    // resto de la conversación — BotConfigService.isBotActive() = activo_manual OR
    // (usa_horario AND en horario) — para que, en PROD, un chat entrante en horario del
    // bot arranque directo en modo BOT aunque activo_manual esté en FALSE.
    // Fuera de producción (MODE != PROD) los chats nuevos NUNCA arrancan en modo BOT
    // automáticamente (ni por activo_manual ni por horario) — evita que pruebas en DEV
    // disparen respuestas automáticas del bot a números reales; hay que activarlo
    // manualmente por chat (bot/toggle-chat) para probarlo.
    // Tampoco se auto-activa cuando el chat nace de un mensaje SALIENTE (isInbound=false,
    // ej. un agente escribe primero a un contacto/proveedor desde la app de WhatsApp):
    // si un humano ya inició la conversación, el bot no debe tomarla automáticamente.
    let activoInicial = false;
    if (envs.mode === 'PROD' && isInbound) {
      const cuentaRow = await this.dataSource.pool.query<{ ide_whcue: number }>(
        `SELECT ide_whcue FROM wha_cuenta WHERE id_cuenta_whcue = $1 AND activo_whcue = TRUE LIMIT 1`,
        [phoneNumberId],
      );
      const ideWhcue = cuentaRow.rows[0]?.ide_whcue;
      if (ideWhcue) {
        activoInicial = await this.botConfig.isBotActive(ideWhcue);
      }
    }
    const modoInicial = activoInicial ? 'BOT' : 'ASESOR';

    // En el UPDATE (chat ya existente), "no leído"/contador y ultimo_ingreso_cliente_whcha
    // solo deben tocarse cuando el mensaje es entrante (isInbound=true). Si upsertChat se
    // llama para un echo saliente (agente escribiendo desde la app nativa) sobre un chat
    // que ya existía, no debe marcarlo como no leído ni pisar la fecha del último mensaje
    // real del cliente con NULL.
    const sql = `
      INSERT INTO wha_chat (
        wa_id_whcha, phone_number_id_whcha, phone_number_whcha,
        name_whcha, nombre_whcha,
        fecha_crea_whcha, fecha_msg_whcha,
        leido_whcha, no_leidos_whcha,
        ultimo_ingreso_cliente_whcha, bot_activo_whcha, bot_modo_whcha
      )
      VALUES ($1, $2, $3, $4, $4, $5, $5, FALSE, 1, $6, $7, $8)
      ON CONFLICT (wa_id_whcha) DO UPDATE SET
        fecha_msg_whcha              = $5,
        leido_whcha                  = CASE WHEN $9 THEN FALSE ELSE wha_chat.leido_whcha END,
        no_leidos_whcha              = CASE WHEN $9 THEN wha_chat.no_leidos_whcha + 1 ELSE wha_chat.no_leidos_whcha END,
        name_whcha                   = COALESCE($4, wha_chat.name_whcha),
        nombre_whcha                 = COALESCE($4, wha_chat.nombre_whcha),
        phone_number_id_whcha        = EXCLUDED.phone_number_id_whcha,
        ultimo_ingreso_cliente_whcha = COALESCE($6, wha_chat.ultimo_ingreso_cliente_whcha)
      RETURNING ide_whcha
    `;
    const nowStr = now.toISOString();
    const inboundTs = isInbound ? nowStr : null;
    const result = await this.dataSource.pool.query(sql, [
      waId, phoneNumberId, phoneNumberFrom, profileName, nowStr, inboundTs, activoInicial, modoInicial, isInbound,
    ]);
    return result.rows[0].ide_whcha as number;
  }

  /** Devuelve false si el wamid ya existía (webhook duplicado/reintento de YCloud) — no insertó nada nuevo. */
  private async insertMensajeInbound(
    data: YcloudInboundMessage,
    waId: string,
    phoneNumberId: string,
    ideWhcha: number,
    now: Date,
  ): Promise<boolean> {
    const wamid = data.wamid || data.id;

    const existsQ = await this.dataSource.pool.query(
      `SELECT 1 FROM wha_mensaje WHERE id_whmem = $1 LIMIT 1`,
      [wamid],
    );
    if (existsQ.rowCount > 0) return false;

    const tipo = data.type || 'text';
    const body = data.text?.body || data.button?.text
      || data.interactive?.button_reply?.title
      || data.interactive?.buttonReply?.title
      || data.interactive?.list_reply?.title
      || data.interactive?.listReply?.title
      || null;
    const caption = data.image?.caption || data.video?.caption || data.document?.caption || null;

    const buildBase = (): InsertQuery => {
      const q = new InsertQuery('wha_mensaje', 'uuid');
      q.values.set('ide_whcha', ideWhcha);
      q.values.set('phone_number_id_whmem', phoneNumberId);
      q.values.set('phone_number_whmem', data.from);
      q.values.set('wa_id_whmem', waId);
      q.values.set('id_whmem', wamid);
      q.values.set('body_whmem', body);
      q.values.set('caption_whmem', caption);
      q.values.set('fecha_whmem', now.toISOString());
      q.values.set('content_type_whmem', tipo);
      q.values.set('direction_whmem', '0');
      q.values.set('leido_whmem', false);
      q.values.set('tipo_whmem', 'YCLOUD');
      q.values.set('timestamp_whmem', data.sendTime || null);
      if (data.context?.id) q.values.set('wa_id_context_whmem', data.context.id);
      return q;
    };

    const addAttachments = (q: InsertQuery): void => {
      if (data.image)    { if (data.image.id) q.values.set('attachment_id_whmem', data.image.id); if (data.image.mime_type) q.values.set('attachment_type_whmem', data.image.mime_type); }
      if (data.video)    { if (data.video.id) q.values.set('attachment_id_whmem', data.video.id); if (data.video.mime_type) q.values.set('attachment_type_whmem', data.video.mime_type); }
      if (data.audio)    { if (data.audio.id) q.values.set('attachment_id_whmem', data.audio.id); if (data.audio.mime_type) q.values.set('attachment_type_whmem', data.audio.mime_type); }
      if (data.document) {
        if (data.document.id) q.values.set('attachment_id_whmem', data.document.id);
        if (data.document.mime_type) q.values.set('attachment_type_whmem', data.document.mime_type);
        if (data.document.filename) q.values.set('attachment_name_whmem', data.document.filename);
      }
      if (data.sticker)  { if (data.sticker.id) q.values.set('attachment_id_whmem', data.sticker.id); if (data.sticker.mime_type) q.values.set('attachment_type_whmem', data.sticker.mime_type); }
    };

    const fullQuery = buildBase();
    addAttachments(fullQuery);

    try {
      await this.dataSource.createQuery(fullQuery);
      this.logger.debug(`[Inbound] Guardado wamid=${wamid} tipo=${tipo} de=${waId}`);
    } catch (fullErr) {
      this.logger.warn(`[insertMensajeInbound] ${wamid}: insert completo falló (${fullErr.message}) — reintentando sin adjuntos`);
      try {
        await this.dataSource.createQuery(buildBase());
        this.logger.debug(`[Inbound] Guardado (sin adjuntos) wamid=${wamid} tipo=${tipo}`);
      } catch (baseErr) {
        this.logger.error(`[insertMensajeInbound] ${wamid}: NO SE PUDO GUARDAR: ${baseErr.message}`);
      }
    }
    return true;
  }

  private async processStatusUpdate(data: YcloudStatusData): Promise<void> {
    try {
      const yCloudId = data.id;
      const wamid = data.wamid || data.id;

      // saveMessageSent stores resp.id (YCloud internal ID), while the webhook
      // carries data.wamid (WhatsApp WAMID) — they differ, so we search by both.
      const existsResult = await this.dataSource.pool.query<{ ide_whmem: number }>(
        `SELECT ide_whmem FROM wha_mensaje WHERE id_whmem = $1 OR id_whmem = $2 LIMIT 1`,
        [yCloudId, wamid],
      );
      const existing = existsResult.rows[0] || null;

      if (existing) {
        const updateQuery = new UpdateQuery('wha_mensaje', 'uuid');
        updateQuery.values.set('status_whmem', data.status);

        // Normalise id_whmem to the WhatsApp WAMID on first status update.
        // saveMessageSent stores resp.id (YCloud internal ID); after this update
        // id_whmem becomes the WAMID so context references (quoted replies) resolve.
        if (data.wamid && data.wamid !== yCloudId) {
          updateQuery.values.set('id_whmem', data.wamid);
        }

        if (data.status === 'sent') {
          updateQuery.values.set('timestamp_whmem', data.sendTime || data.createTime);
        } else if (data.status === 'delivered') {
          updateQuery.values.set('timestamp_sent_whmem', data.deliverTime || data.sendTime);
        } else if (data.status === 'read') {
          updateQuery.values.set('timestamp_read_whmem', data.readTime || data.deliverTime);
          updateQuery.values.set('leido_whmem', true);
          this.whatsappGateway.sendReadMessageToClients(wamid);
        } else if (data.status === 'failed') {
          if (data.errors && data.errors.length > 0) {
            const errorDetail = (data.errors[0].error_data?.details || data.errors[0].message || '');
            updateQuery.values.set('error_whmem', errorDetail.substring(0, 500));
            updateQuery.values.set('code_error_whmem', `${data.errors[0].code} - ${data.errors[0].title}`.substring(0, 100));
          }
        }

        // Update by primary key to avoid ambiguity
        updateQuery.where = 'ide_whmem = $1';
        updateQuery.addIntParam(1, existing.ide_whmem);
        await this.dataSource.createQuery(updateQuery);
      } else {
        await this.insertOutboundMessage(data, wamid);
      }
    } catch (error) {
      this.logger.error(`Status update failed [${data.wamid || data.id}] status=${data.status}: ${error.message}`);
    }
  }

  private buildOutboundAttachments(data: YcloudStatusData, q: InsertQuery | UpdateQuery): void {
    if (data.image) {
      const id = data.image.id || this.extractInboxKey(data.image.link);
      if (id) q.values.set('attachment_id_whmem', id);
      if (data.image.mime_type) q.values.set('attachment_type_whmem', data.image.mime_type);
      q.values.set('attachment_url_whmem', data.image.link || null);
      if (data.image.caption) q.values.set('caption_whmem', data.image.caption);
    } else if (data.video) {
      const id = data.video.id || this.extractInboxKey(data.video.link);
      if (id) q.values.set('attachment_id_whmem', id);
      if (data.video.mime_type) q.values.set('attachment_type_whmem', data.video.mime_type);
      q.values.set('attachment_url_whmem', data.video.link || null);
      if (data.video.caption) q.values.set('caption_whmem', data.video.caption);
    } else if (data.audio) {
      const id = data.audio.id || this.extractInboxKey(data.audio.link);
      if (id) q.values.set('attachment_id_whmem', id);
      if (data.audio.mime_type) q.values.set('attachment_type_whmem', data.audio.mime_type);
      q.values.set('attachment_url_whmem', data.audio.link || null);
    } else if (data.document) {
      const id = data.document.id || this.extractInboxKey(data.document.link);
      if (id) q.values.set('attachment_id_whmem', id);
      if (data.document.mime_type) q.values.set('attachment_type_whmem', data.document.mime_type);
      q.values.set('attachment_url_whmem', data.document.link || null);
      if (data.document.filename) q.values.set('attachment_name_whmem', data.document.filename);
      if (data.document.caption) q.values.set('caption_whmem', data.document.caption);
    } else if (data.sticker) {
      const id = data.sticker.id || this.extractInboxKey(data.sticker.link);
      if (id) q.values.set('attachment_id_whmem', id);
      if (data.sticker.mime_type) q.values.set('attachment_type_whmem', data.sticker.mime_type);
      q.values.set('attachment_url_whmem', data.sticker.link || null);
    }
    if (data.location) {
      q.values.set('location_lat_whmem', data.location.latitude);
      q.values.set('location_lng_whmem', data.location.longitude);
      if (data.location.name) q.values.set('location_name_whmem', data.location.name);
      if (data.location.address) q.values.set('location_address_whmem', data.location.address);
    }
    if (data.pricingCategory) q.values.set('pricing_category_whmem', data.pricingCategory);
  }

  private async insertOutboundMessage(data: YcloudStatusData, wamid: string): Promise<void> {
    const customerWaId = (data.to || '').replace(/^\+/, '');
    const businessPhone = (data.from || '').replace(/^\+/, '');
    const tipo = data.type || 'text';
    const body = data.text?.body || data.image?.caption || data.video?.caption || data.document?.caption || '';

    const buildBase = (): InsertQuery => {
      const q = new InsertQuery('wha_mensaje', 'uuid');
      q.values.set('id_whmem', wamid);
      q.values.set('wa_id_whmem', customerWaId);
      q.values.set('phone_number_id_whmem', businessPhone);
      q.values.set('direction_whmem', 1);
      q.values.set('content_type_whmem', tipo);
      q.values.set('body_whmem', body);
      q.values.set('status_whmem', data.status);
      q.values.set('fecha_whmem', data.sendTime || data.createTime || new Date().toISOString());
      q.values.set('tipo_whmem', 'YCLOUD');
      q.values.set('leido_whmem', false);
      if (data.status === 'delivered') q.values.set('timestamp_sent_whmem', data.deliverTime || data.sendTime);
      else if (data.status === 'read') { q.values.set('timestamp_read_whmem', data.readTime || data.deliverTime); q.values.set('leido_whmem', true); }
      return q;
    };

    // Intento completo (campos base + adjuntos)
    const fullQuery = buildBase();
    try {
      this.buildOutboundAttachments(data, fullQuery);
    } catch (attachErr) {
      this.logger.warn(`[insertOutboundMessage] ${wamid}: error preparando adjuntos: ${attachErr.message}`);
    }

    try {
      await this.dataSource.createQuery(fullQuery);
      this.logger.debug(`[Outbound] Guardado wamid=${wamid} tipo=${tipo} status=${data.status}`);
      return;
    } catch (fullErr) {
      this.logger.warn(`[insertOutboundMessage] ${wamid}: insert completo falló (${fullErr.message}) — reintentando sin adjuntos`);
    }

    // Fallback: solo campos base
    try {
      await this.dataSource.createQuery(buildBase());
      this.logger.debug(`[Outbound] Guardado (sin adjuntos) wamid=${wamid} tipo=${tipo}`);
    } catch (baseErr) {
      this.logger.error(`[insertOutboundMessage] ${wamid}: NO SE PUDO GUARDAR: ${baseErr.message}`);
      throw baseErr;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  private async processTemplateResponse(data: Record<string, any>): Promise<void> {
  }

  private async processContactEvent(data: Record<string, any>): Promise<void> {
    try {
      const waId = data?.whatsappId || data?.wa_id || data?.phoneNumber || data?.from;
      const name = data?.name || data?.profile?.name || data?.customerProfile?.name;
      if (!waId || !name) return;

      const normalizedWaId = waId.replace('+', '');
      const updateQuery = new UpdateQuery('wha_chat', 'uuid');
      updateQuery.values.set('name_whcha', name);
      updateQuery.where = 'wa_id_whcha = $1';
      updateQuery.addStringParam(1, normalizedWaId);
      await this.dataSource.createQuery(updateQuery);
    } catch (error) {
      this.logger.error(`Error processing contact event: ${error.message}`);
    }
  }

  // ─── Campaign helpers ─────────────────────────────────────────

  async enviarMensajeTextoCampania(
    ideEmpr: number,
    telefono: string,
    texto: string,
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const payload: YcloudTextPayload = {
      from: config.displayPhoneNumber,
      to: telefono,
      type: 'text',
      text: { body: texto, preview_url: false },
    };

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono,
        tipo: 'text',
        texto,
        idWts: messageId,
        ideUsua,
        tiempoRespuesta: null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  async enviarMensajeMediaCampania(
    ideEmpr: number,
    telefono: string,
    caption: string,
    file: Express.Multer.File,
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const mimeType = file.mimetype;
    const { mediaId } = await this.uploadMedia(ideEmpr, file.buffer, mimeType, file.originalname);

    const mediaType = mimeType.startsWith('image')
      ? 'image'
      : mimeType.startsWith('video')
        ? 'video'
        : mimeType.startsWith('audio')
          ? 'audio'
          : 'document';

    const from = config.displayPhoneNumber;
    let payload: YcloudMessagePayload;
    if (mediaType === 'image') {
      payload = { from, to: telefono, type: 'image', image: { id: mediaId, caption } };
    } else if (mediaType === 'video') {
      payload = { from, to: telefono, type: 'video', video: { id: mediaId, caption } };
    } else if (mediaType === 'audio') {
      payload = { from, to: telefono, type: 'audio', audio: { id: mediaId } };
    } else {
      payload = { from, to: telefono, type: 'document', document: { id: mediaId, filename: file.originalname, caption } };
    }

    const resp: YcloudSendResponse = await this.apiPost('/whatsapp/messages', payload);
    const messageId = resp.messages?.[0]?.id || resp.id;

    await this.saveMessageSent(
      {
        telefono,
        tipo: mediaType,
        texto: caption || null,
        idWts: messageId,
        mediaId,
        fileName: file.originalname,
        mimeType,
        ideUsua,
        tiempoRespuesta: null,
      },
      config,
    );

    await this.metricsService.logSyncEvent({
      ideEmpr,
      idMensaje: messageId,
      tipo: 'S',
      payloadYcloud: resp,
      estado: 'PENDING',
    });

    return { messageId };
  }

  // ─── Save message in DB ───────────────────────────────────────

  async saveMessageSent(data: MessageSaveData, config: YcloudCacheConfig): Promise<any> {
    if (!isDefined(config)) {
      throw new BadRequestException('Error al obtener la configuracion YCloud');
    }

    try {
      const normalizedPhone = data.telefono.replace(/^\+/, '');
      const now = new Date().toISOString();

      // Actualiza wha_chat: fecha, último id y resetea no_leidos porque el agente está respondiendo
      await this.dataSource.pool.query(
        `UPDATE wha_chat
            SET id_whcha        = $1,
                fecha_msg_whcha = $2,
                no_leidos_whcha = 0,
                leido_whcha     = TRUE
          WHERE wa_id_whcha = $3`,
        [data.idWts, now, normalizedPhone],
      );

      const insertQuery = new InsertQuery('wha_mensaje', 'uuid');
      insertQuery.values.set('phone_number_id_whmem', config.phoneNumberId);
      insertQuery.values.set('wa_id_whmem', normalizedPhone);
      insertQuery.values.set('id_whmem', data.idWts);
      insertQuery.values.set('body_whmem', data.texto || '');
      insertQuery.values.set('fecha_whmem', now);
      insertQuery.values.set('content_type_whmem', data.tipo);
      insertQuery.values.set('leido_whmem', false);
      insertQuery.values.set('direction_whmem', 1);
      insertQuery.values.set('attachment_name_whmem', data.fileName || null);
      insertQuery.values.set('attachment_type_whmem', data.mimeType || null);
      insertQuery.values.set('tipo_whmem', 'YCLOUD');
      insertQuery.values.set('attachment_id_whmem', data.mediaId || null);
      insertQuery.values.set('caption_whmem', data.tipo === 'text' ? null : data.texto);

      if (data.ideUsua) {
        insertQuery.values.set('ide_usua_whmem', data.ideUsua);
      }
      if (data.tiempoRespuesta != null) {
        insertQuery.values.set('tiempo_respuesta_seg_whmem', data.tiempoRespuesta);
      }
      if (data.contextMessageId) {
        insertQuery.values.set('wa_id_context_whmem', data.contextMessageId);
      }

      const res = await this.dataSource.createQuery(insertQuery);
      // Emitir siempre sin + para que coincida con wa_id_whcha en el frontend
      this.whatsappGateway.sendMessageToClients(normalizedPhone);
      return res;
    } catch (error) {
      this.logger.error(`Error saveMessageSent: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Error saveMessageSent: ${error.message}`);
    }
  }

  // ─── Validate ─────────────────────────────────────────────────

  async validateNumber(
    ideEmpr: number,
    phoneNumber: string,
  ): Promise<{ isValid: boolean; formattedNumber?: string; error?: string }> {
    const normalizedPhone = phoneNumber.replace(/[^\d]/g, '');
    if (!normalizedPhone || normalizedPhone.length < 8) {
      return { isValid: false, error: 'Numero de telefono no valido' };
    }

    const query = new SelectQuery(`
      SELECT f_existe_telefono_whatsapp($1) AS existe
    `);
    query.addParam(1, normalizedPhone);
    const res = await this.dataSource.createSingleQuery(query);

    if (res?.existe === true) {
      return { isValid: true, formattedNumber: normalizedPhone };
    }

    return { isValid: true, formattedNumber: normalizedPhone };
  }

  // ─── Sync ─────────────────────────────────────────────────────

  /**
   * Procesa el echo de un mensaje enviado desde WhatsApp Web / App nativa (fuera de
   * nuestra API). Antes solo reseteaba no_leidos_whcha; NO guardaba el mensaje en
   * wha_mensaje. Eso provocaba que, si un agente escribía primero a un contacto
   * directo desde la app (sin pasar por el dashboard/bot), el chat no tuviera
   * registro de intervención humana — el bot lo detectaba como "chat nuevo sin
   * historial" y se auto-iniciaba con el saludo, aunque la conversación ya llevaba
   * mensajes. Ahora se persiste el mensaje (direction_whmem=1) y se asegura el chat
   * (isInbound=false → nunca auto-activa el bot para chats iniciados por un agente).
   */
  private async processEchoMessage(data: YcloudStatusData): Promise<void> {
    try {
      // data.from = número de la empresa (quien envió), data.to = número del cliente
      const customerWaId = (data.to || '').replace(/^\+/, '');
      const businessPhoneRaw = (data.from || '').replace(/^\+/, '');
      if (!customerWaId || !businessPhoneRaw) return;

      const cuentaRow = await this.dataSource.pool.query<{ id_cuenta_whcue: string }>(
        `SELECT id_cuenta_whcue FROM wha_cuenta
         WHERE activo_whcue = TRUE AND REPLACE(id_telefono_whcue, '+', '') = $1
         LIMIT 1`,
        [businessPhoneRaw],
      );
      const phoneNumberId = cuentaRow.rows[0]?.id_cuenta_whcue;
      if (!phoneNumberId) return; // número de empresa no reconocido

      const now = data.sendTime ? new Date(data.sendTime) : new Date();

      const ideWhcha = await this.upsertChat({
        waId: customerWaId,
        phoneNumberId,
        phoneNumberFrom: data.to,
        profileName: null,
        now,
        isInbound: false,
      });

      await this.insertMensajeEcho(data, customerWaId, phoneNumberId, ideWhcha, now);

      await this.dataSource.pool.query(
        `UPDATE wha_chat SET no_leidos_whcha = 0, leido_whcha = TRUE WHERE ide_whcha = $1`,
        [ideWhcha],
      );

      void this.emitTotalNoLeidos(phoneNumberId);
    } catch (error) {
      this.logger.error(`Error processEchoMessage: ${error.message}`);
    }
  }

  /** Guarda el mensaje saliente detrás de un echo (agente escribiendo desde la app nativa). Dedupe por wamid. */
  private async insertMensajeEcho(
    data: YcloudStatusData,
    customerWaId: string,
    phoneNumberId: string,
    ideWhcha: number,
    now: Date,
  ): Promise<void> {
    const wamid = data.wamid || data.id;
    if (!wamid) return;

    const existsQ = await this.dataSource.pool.query(
      `SELECT 1 FROM wha_mensaje WHERE id_whmem = $1 LIMIT 1`,
      [wamid],
    );
    if (existsQ.rowCount > 0) return;

    const tipo = data.type || 'text';
    const body = data.text?.body
      || data.image?.caption || data.video?.caption || data.document?.caption
      || null;

    const insertQuery = new InsertQuery('wha_mensaje', 'uuid');
    insertQuery.values.set('ide_whcha', ideWhcha);
    insertQuery.values.set('phone_number_id_whmem', phoneNumberId);
    insertQuery.values.set('wa_id_whmem', customerWaId);
    insertQuery.values.set('id_whmem', wamid);
    insertQuery.values.set('body_whmem', body);
    insertQuery.values.set('fecha_whmem', now.toISOString());
    insertQuery.values.set('content_type_whmem', tipo);
    insertQuery.values.set('direction_whmem', 1);
    insertQuery.values.set('leido_whmem', true);
    insertQuery.values.set('tipo_whmem', 'YCLOUD');
    insertQuery.values.set('timestamp_whmem', data.sendTime || null);

    try {
      await this.dataSource.createQuery(insertQuery);
      this.logger.debug(`[Echo] Guardado wamid=${wamid} tipo=${tipo} chat=${ideWhcha}`);
    } catch (err) {
      this.logger.warn(`[insertMensajeEcho] ${wamid}: no se pudo guardar: ${err.message}`);
    }
  }

  private async emitTotalNoLeidos(phoneNumberId: string): Promise<void> {
    try {
      const result = await this.dataSource.pool.query<{ ide_empr: number; total: number }>(
        `SELECT cu.ide_empr, COUNT(c.ide_whcha)::int AS total
         FROM wha_cuenta cu
         LEFT JOIN wha_chat c
           ON c.phone_number_id_whcha = cu.id_cuenta_whcue
          AND c.leido_whcha = FALSE
         WHERE cu.id_cuenta_whcue = $1
           AND cu.activo_whcue = TRUE
         GROUP BY cu.ide_empr`,
        [phoneNumberId],
      );
      if (result.rows.length > 0) {
        const { ide_empr, total } = result.rows[0];
        this.whatsappGateway.emitTotalChatsNoLeidos(ide_empr, total);
      }
    } catch (error) {
      this.logger.error(`Error emitTotalNoLeidos: ${error.message}`);
    }
  }

  async syncPendingMessages(ideEmpr: number): Promise<{ reconciled: number; errors: number }> {
    const orphans = await this.metricsService.orphanLocalMessages(ideEmpr);
    let reconciled = 0;
    let errors = 0;

    for (const msgId of orphans) {
      try {
        await this.metricsService.reconcileMessage(ideEmpr, msgId);
        reconciled++;
      } catch (error) {
        await this.metricsService.markAsConflict(ideEmpr, msgId, error.message);
        errors++;
      }
    }

    return { reconciled, errors };
  }
}
