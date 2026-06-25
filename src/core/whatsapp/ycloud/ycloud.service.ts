import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { isDefined } from 'class-validator';
import FormData from 'form-data';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { getCurrentDateTime } from 'src/util/helpers/date-util';

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
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const windowCheck = await this.windowService.canSendFreeMessage(config.phoneNumberId, to);
    if (!windowCheck.allowed) {
      throw new BadRequestException(windowCheck.reason);
    }

    const payload: YcloudTextPayload = {
      from: config.displayPhoneNumber,
      to,
      type: 'text',
      text: { body, preview_url: false },
    };

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
      const now = new Date();

      const ideWhcha = await this.upsertChat({
        waId,
        phoneNumberId,
        phoneNumberFrom: data.from,
        profileName,
        now,
        isInbound: true,
      });

      await this.insertMensajeInbound(data, waId, phoneNumberId, ideWhcha, now);
      await this.windowService.registerInboundMessage(waId, phoneNumberId);
      this.whatsappGateway.sendMessageToClients(waId);
      void this.emitTotalNoLeidos(phoneNumberId);

      const textoBot = data.text?.body
        || data.button?.payload
        || data.interactive?.button_reply?.id
        || data.interactive?.list_reply?.id
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

    // bot_activo_whcha inicial depende de si el bot global está activo (activo_manual)
    const sql = `
      WITH bot_estado AS (
        SELECT COALESCE(bc.activo_manual, FALSE) AS activo
        FROM wha_cuenta cu
        LEFT JOIN wha_bot_config bc ON bc.ide_whcue = cu.ide_whcue
        WHERE cu.id_cuenta_whcue = $2
          AND cu.activo_whcue = TRUE
        LIMIT 1
      )
      INSERT INTO wha_chat (
        wa_id_whcha, phone_number_id_whcha, phone_number_whcha,
        name_whcha, nombre_whcha,
        fecha_crea_whcha, fecha_msg_whcha,
        leido_whcha, no_leidos_whcha,
        ultimo_ingreso_cliente_whcha, bot_activo_whcha, bot_modo_whcha
      )
      SELECT $1, $2, $3, $4, $4, $5, $5, FALSE, 1, $6,
             activo,
             CASE WHEN activo THEN 'BOT' ELSE 'ASESOR' END
      FROM bot_estado
      ON CONFLICT (wa_id_whcha) DO UPDATE SET
        fecha_msg_whcha              = $5,
        leido_whcha                  = FALSE,
        no_leidos_whcha              = wha_chat.no_leidos_whcha + 1,
        name_whcha                   = COALESCE($4, wha_chat.name_whcha),
        nombre_whcha                 = COALESCE($4, wha_chat.nombre_whcha),
        phone_number_id_whcha        = EXCLUDED.phone_number_id_whcha,
        ultimo_ingreso_cliente_whcha = $6
      RETURNING ide_whcha
    `;
    const inboundTs = isInbound ? now.toISOString() : null;
    const result = await this.dataSource.pool.query(sql, [
      waId, phoneNumberId, phoneNumberFrom, profileName, now.toISOString(), inboundTs,
    ]);
    return result.rows[0].ide_whcha as number;
  }

  private async insertMensajeInbound(
    data: YcloudInboundMessage,
    waId: string,
    phoneNumberId: string,
    ideWhcha: number,
    now: Date,
  ): Promise<void> {
    const wamid = data.wamid || data.id;

    const existsQ = await this.dataSource.pool.query(
      `SELECT 1 FROM wha_mensaje WHERE id_whmem = $1 LIMIT 1`,
      [wamid],
    );
    if (existsQ.rowCount > 0) return;

    const tipo = data.type || 'text';
    const body = data.text?.body || data.button?.text
      || data.interactive?.button_reply?.title || data.interactive?.list_reply?.title || null;
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
  }

  private async processStatusUpdate(data: YcloudStatusData): Promise<void> {
    try {
      const wamid = data.wamid || data.id;

      const existsQuery = new SelectQuery(`SELECT ide_whmem FROM wha_mensaje WHERE id_whmem = $1 LIMIT 1`);
      existsQuery.addStringParam(1, wamid);
      const existing = await this.dataSource.createSingleQuery(existsQuery);

      if (existing) {
        const updateQuery = new UpdateQuery('wha_mensaje', 'uuid');
        updateQuery.values.set('status_whmem', data.status);

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

        updateQuery.where = 'id_whmem = $1';
        updateQuery.addStringParam(1, wamid);
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
      insertQuery.values.set('fecha_whmem', getCurrentDateTime());
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
   * Procesa el echo de un mensaje enviado desde WhatsApp Web / App nativa.
   * Resetea no_leidos_whcha porque el agente leyó y respondió desde esa interfaz.
   */
  private async processEchoMessage(data: YcloudStatusData): Promise<void> {
    try {
      // data.from = número de la empresa (quien envió)
      // data.to   = número del cliente (destinatario)
      const customerWaId = (data.to || '').replace(/^\+/, '');
      const businessPhone = (data.from || '').replace(/^\+/, '');
      if (!customerWaId || !businessPhone) return;

      const result = await this.dataSource.pool.query<{ ide_empr: number }>(
        `UPDATE wha_chat c
            SET no_leidos_whcha = 0,
                leido_whcha     = TRUE
           FROM wha_cuenta cu
          WHERE c.wa_id_whcha           = $1
            AND cu.activo_whcue         = TRUE
            AND REPLACE(cu.id_telefono_whcue, '+', '') = $2
            AND c.phone_number_id_whcha = cu.id_cuenta_whcue
          RETURNING cu.ide_empr`,
        [customerWaId, businessPhone],
      );

      if (result.rows.length > 0) {
        const { ide_empr } = result.rows[0];
        const phoneNumberId = (await this.dataSource.pool.query<{ id_cuenta_whcue: string }>(
          `SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $1 AND activo_whcue = TRUE LIMIT 1`,
          [ide_empr],
        )).rows[0]?.id_cuenta_whcue;

        if (phoneNumberId) {
          void this.emitTotalNoLeidos(phoneNumberId);
        }
      }
    } catch (error) {
      this.logger.error(`Error processEchoMessage: ${error.message}`);
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
