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

@Injectable()
export class YcloudService {
  private readonly YCLOUD_API_URL: string;
  private readonly YCLOUD_API_KEY: string;
  private readonly logger = new Logger(YcloudService.name);

  constructor(
    private readonly httpService: HttpService,
    public readonly dataSource: DataSourceService,
    private readonly whatsappGateway: WhatsappGateway,
    private readonly windowService: YcloudWindowService,
    private readonly metricsService: YcloudMetricsService,
  ) {
    this.YCLOUD_API_URL = envs.ycloudApiUrl || 'https://api.ycloud.com/v2';
    this.YCLOUD_API_KEY = envs.ycloudApiKey || '';
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
      apiKey: this.YCLOUD_API_KEY,
      phoneNumberId: data.id_telefono_whcue,
      businessId: data.business_id_whcue,
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
        business_id_whcue,
        id_telefono_whcue,
        webhook_url_whcue
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
      this.logger.error(`YCloud POST form-data ${path} error: ${error.response?.data || error.message}`);
      throw new InternalServerErrorException(
        `[YCloud API Error] ${JSON.stringify(error.response?.data || error.message)}`,
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

  async sendDocument(
    ideEmpr: number,
    to: string,
    mediaId: string,
    filename: string,
    caption?: string,
    ideUsua?: number,
  ): Promise<{ messageId: string }> {
    const config = await this.assertConfig(ideEmpr);

    const windowCheck = await this.windowService.canSendFreeMessage(config.phoneNumberId, to);
    if (!windowCheck.allowed) {
      throw new BadRequestException(windowCheck.reason);
    }

    const payload: YcloudDocumentPayload = {
      to,
      type: 'document',
      document: { id: mediaId, filename, caption },
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

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const url = `${this.YCLOUD_API_URL}/whatsapp/media/${mediaId}`;
    const config: AxiosRequestConfig = {
      responseType: 'arraybuffer',
      headers: { 'X-API-Key': this.YCLOUD_API_KEY },
      timeout: 30000,
    };
    try {
      const response = await this.httpService.axiosRef.get(url, config);
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      this.logger.error(`YCloud download media error: ${error.response?.data || error.message}`);
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
      default:
        this.logger.log(`Evento YCloud no procesado (${payload.type}), payload registrado`);
        break;
    }
  }

  private async processInboundMessage(data: YcloudInboundMessage): Promise<void> {
    try {
      const phoneNumberId = (data.to || data.from).replace(/^\+/, '');
      const msgPayload = { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: data };
      const jsonMsg = JSON.stringify(msgPayload);
      const query = new SelectQuery(`SELECT mensaje_ycloud($1::jsonb, $2) AS wa_id`);
      query.addStringParam(1, jsonMsg);
      query.addStringParam(2, data.to || data.from);
      const res = await this.dataSource.createSingleQuery(query);
      this.whatsappGateway.sendMessageToClients(res.wa_id);
    } catch (error) {
      this.logger.error(`Error processing inbound message: ${error.message}`, error.stack);
      throw error;
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
            updateQuery.values.set('error_whmem', data.errors[0].error_data?.details || data.errors[0].message);
            updateQuery.values.set('code_error_whmem', `${data.errors[0].code} - ${data.errors[0].title}`);
          }
        }

        updateQuery.where = 'id_whmem = $1';
        updateQuery.addStringParam(1, wamid);
        await this.dataSource.createQuery(updateQuery);
      } else {
        await this.insertOutboundMessage(data, wamid);
      }
    } catch (error) {
      this.logger.error(`Status update failed: ${error.message}`);
    }
  }

  private async insertOutboundMessage(data: YcloudStatusData, wamid: string): Promise<void> {
    const customerWaId = (data.to || '').replace(/^\+/, '');
    const businessPhone = (data.from || '').replace(/^\+/, '');
    const tipo = data.type || 'text';

    let body = data.text?.body || '';
    if (data.image) body = data.image.caption || '';
    if (data.video) body = data.video.caption || '';
    if (data.document) body = data.document.caption || '';

    const insertQuery = new InsertQuery('wha_mensaje', 'uuid');
    insertQuery.values.set('id_whmem', wamid);
    insertQuery.values.set('wa_id_whmem', customerWaId);
    insertQuery.values.set('phone_number_id_whmem', businessPhone);
    insertQuery.values.set('direction_whmem', 1);
    insertQuery.values.set('content_type_whmem', tipo);
    insertQuery.values.set('body_whmem', body);
    insertQuery.values.set('status_whmem', data.status);
    insertQuery.values.set('fecha_whmem', data.sendTime || data.createTime || new Date().toISOString());
    insertQuery.values.set('tipo_whmem', 'YCLOUD');
    insertQuery.values.set('leido_whmem', false);

    if (data.status === 'delivered') {
      insertQuery.values.set('timestamp_sent_whmem', data.deliverTime || data.sendTime);
    } else if (data.status === 'read') {
      insertQuery.values.set('timestamp_read_whmem', data.readTime || data.deliverTime);
      insertQuery.values.set('leido_whmem', true);
    }

    if (data.image) {
      insertQuery.values.set('attachment_id_whmem', data.image.id);
      insertQuery.values.set('attachment_type_whmem', data.image.mime_type);
      insertQuery.values.set('caption_whmem', data.image.caption || null);
    } else if (data.video) {
      insertQuery.values.set('attachment_id_whmem', data.video.id);
      insertQuery.values.set('attachment_type_whmem', data.video.mime_type);
      insertQuery.values.set('caption_whmem', data.video.caption || null);
    } else if (data.audio) {
      insertQuery.values.set('attachment_id_whmem', data.audio.id);
      insertQuery.values.set('attachment_type_whmem', data.audio.mime_type);
    } else if (data.document) {
      insertQuery.values.set('attachment_id_whmem', data.document.id);
      insertQuery.values.set('attachment_type_whmem', data.document.mime_type);
      insertQuery.values.set('attachment_name_whmem', data.document.filename || null);
      insertQuery.values.set('caption_whmem', data.document.caption || null);
    } else if (data.sticker) {
      insertQuery.values.set('attachment_id_whmem', data.sticker.id);
      insertQuery.values.set('attachment_type_whmem', data.sticker.mime_type);
    }

    if (data.location) {
      insertQuery.values.set('location_lat_whmem', data.location.latitude);
      insertQuery.values.set('location_lng_whmem', data.location.longitude);
      if (data.location.name) insertQuery.values.set('location_name_whmem', data.location.name);
      if (data.location.address) insertQuery.values.set('location_address_whmem', data.location.address);
    }

    if (data.pricingCategory) {
      insertQuery.values.set('pricing_category_whmem', data.pricingCategory);
    }

    await this.dataSource.createQuery(insertQuery);
  }

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

    let payload: YcloudMessagePayload;
    if (mediaType === 'image') {
      payload = { to: telefono, type: 'image', image: { id: mediaId, caption } };
    } else if (mediaType === 'video') {
      payload = { to: telefono, type: 'video', video: { id: mediaId, caption } };
    } else if (mediaType === 'audio') {
      payload = { to: telefono, type: 'audio', audio: { id: mediaId } };
    } else {
      payload = { to: telefono, type: 'document', document: { id: mediaId, filename: file.originalname, caption } };
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
      const updateChatQuery = new UpdateQuery('wha_chat', 'ide_whcha');
      updateChatQuery.values.set('id_whcha', data.idWts);
      updateChatQuery.where = 'wa_id_whcha = $1';
      updateChatQuery.addStringParam(1, normalizedPhone);
      await this.dataSource.createQuery(updateChatQuery);

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
      this.whatsappGateway.sendMessageToClients(data.telefono);
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
