import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Client, LocalAuth, Location, Message, MessageMedia } from "whatsapp-web.js";
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import * as qrcode from 'qrcode-terminal';
import PQueue from 'p-queue';
import { WHATSAPP_CONFIG, WEB_VERSION_CACHE } from './whatsapp-web.constants';
import {
    WhatsAppEvent,
    MessageData,
    StatusResponse,
    SendMessageResponse,
    WhatsAppClientInstance,
} from './interface/whatsapp-web.interface';
import { SendMenssageDto } from "./dto/send-message.dto";
import { SendMediaDto } from "./dto/send-media.dto";
import { ServiceDto } from "src/common/dto/service.dto";
import { fTimestampToISODate } from "src/util/helpers/date-util";
import { detectMimeType, generateFilename, getDefaultMimeType } from "src/util/helpers/file-utils";
import { SendLocationDto } from "./dto/send-location.dto";
import { GetChatsWebDto } from "./dto/get-chats-web.dto";
import { GetMessagesWebDto } from "./dto/get-messages-web.dto";



@Injectable()
export class WhatsappWebService implements OnModuleInit {
    private readonly logger = new Logger(WhatsappWebService.name);
    private clients: Map<string, WhatsAppClientInstance> = new Map();
    private messageQueues: Map<string, PQueue> = new Map();

    async onModuleInit() {
        await this.initializeSession();
    }

    // --- Initialization --- //
    private async initializeSession() {
        const sessionPath = path.join(__dirname, '..', '..', WHATSAPP_CONFIG.sessionPath);
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }
    }

    // --- Client Management --- //
    private async getClientInstance(ideEmpr: string): Promise<WhatsAppClientInstance> {
        if (this.clients.has(ideEmpr)) {
            const instance = this.clients.get(ideEmpr);
            if (instance.status === 'ready') return instance;

            if (instance.status === 'disconnected') {
                await this.attemptReconnection(ideEmpr);
            }
            return instance;
        }

        return this.createClientInstance(ideEmpr);
    }

    private async createClientInstance(ideEmpr: string): Promise<WhatsAppClientInstance> {
        // Obtener configuración de la empresa desde tu base de datos
        const cuenta = await this.getAccountConfig(ideEmpr);

        const client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, '..', '..', WHATSAPP_CONFIG.sessionPath, ideEmpr),
                clientId: cuenta.id_cuenta_whcue
            }),
            puppeteer: {
                headless: true,
                args: WHATSAPP_CONFIG.puppeteerArgs,
                executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'
            },
            webVersionCache: WEB_VERSION_CACHE
        });

        const instance: WhatsAppClientInstance = {
            client,
            status: 'loading',
            qrCode: null,
            lastActivity: null,
            connectionAttempts: 0,
            eventEmitter: new EventEmitter()
        };

        this.setupEventHandlers(ideEmpr, instance);
        this.clients.set(ideEmpr, instance);
        this.messageQueues.set(ideEmpr, this.createMessageQueue());

        try {
            await client.initialize();
            return instance;
        } catch (error) {
            this.logger.error(`Initialization error for company ${ideEmpr}:`, error);
            instance.status = 'disconnected';
            this.attemptReconnection(ideEmpr);
            throw error;
        }
    }

    private async getAccountConfig(ideEmpr: string): Promise<any> {
        // Implementa la lógica para obtener la configuración de tu tabla wha_cuenta
        // Esto es un ejemplo:
        return {
            id_cuenta_whcue: `account_${ideEmpr}`,
            // otros campos necesarios...
        };
    }

    private createMessageQueue(): PQueue {
        return new PQueue({
            concurrency: 1,
            interval: 60000 / WHATSAPP_CONFIG.maxMessagesPerMinute,
            intervalCap: 1
        });
    }

    private setupEventHandlers(ideEmpr: string, instance: WhatsAppClientInstance) {
        const { client, eventEmitter } = instance;

        client.on('qr', (qr) => {
            instance.qrCode = qr;
            instance.status = 'qr';
            eventEmitter.emit('qr', qr);
            qrcode.generate(qr, { small: true });
            this.logger.log(`QR Code generated for company ${ideEmpr}`);
        });

        client.on('authenticated', () => {
            instance.status = 'authenticated';
            instance.connectionAttempts = 0;
            this.logger.log(`Client authenticated for company ${ideEmpr}`);
        });

        client.on('ready', () => {
            instance.status = 'ready';
            instance.lastActivity = new Date();
            this.logger.log(`Client is ready for company ${ideEmpr}`);
        });

        client.on('disconnected', (reason) => {
            instance.status = 'disconnected';
            this.logger.warn(`Client disconnected for company ${ideEmpr}: ${reason}`);
            this.attemptReconnection(ideEmpr);
        });

        client.on('auth_failure', (msg) => {
            this.logger.error(`Authentication failure for company ${ideEmpr}:`, msg);
            instance.status = 'disconnected';
        });

        client.on('message', (message) => this.processIncomingMessage(ideEmpr, message));
    }

    private async attemptReconnection(ideEmpr: string) {
        const instance = this.clients.get(ideEmpr);
        if (!instance) return;

        if (instance.connectionAttempts < WHATSAPP_CONFIG.maxConnectionAttempts) {
            instance.connectionAttempts++;
            const delay = WHATSAPP_CONFIG.reconnectDelay * instance.connectionAttempts;
            this.logger.log(`Reconnecting company ${ideEmpr} in ${delay / 1000} seconds...`);

            setTimeout(async () => {
                try {
                    await instance.client.initialize();
                } catch (error) {
                    this.attemptReconnection(ideEmpr);
                }
            }, delay);
        } else {
            this.logger.error(`Max reconnection attempts reached for company ${ideEmpr}`);
        }
    }

    // --- Message Handling --- //
    private async processIncomingMessage(ideEmpr: string, message: Message) {
        try {
            const instance = this.clients.get(ideEmpr);
            if (!instance) return;

            const contact = await message.getContact();
            const chat = await message.getChat();
            instance.lastActivity = new Date();

            const messageData: MessageData = {
                from: message.from,
                senderName: contact.pushname || contact.number,
                body: message.body,
                timestamp: message.timestamp,
                isGroup: chat.isGroup,
                chatName: chat.isGroup ? chat.name : null,
                messageId: message.id._serialized,
                hasMedia: message.hasMedia,
                ...(message.hasMedia && { media: await this.processMedia(message) })
            };

            instance.eventEmitter.emit('message', messageData);
        } catch (error) {
            this.logger.error(`Error processing message for company ${ideEmpr}:`, error);
        }
    }



    // --- Message Sending --- //
    async sendMessage(dto: SendMenssageDto): Promise<any> {
        const queue = this.messageQueues.get(`${dto.ideEmpr}`);
        if (!queue) throw new Error(`No client initialized for company ${dto.ideEmpr}`);

        return queue.add(() => this.unsafeSendMessage(dto));
    }

    private async unsafeSendMessage(dto: SendMenssageDto): Promise<SendMessageResponse> {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }
        try {
            const chatId = this.formatPhoneNumber(dto.telefono);
            const sentMessage = await instance.client.sendMessage(chatId, dto.mensaje);
            instance.lastActivity = new Date();

            this.logger.log(`Message sent to ${dto.telefono} for company ${dto.ideEmpr}`, {
                messageId: sentMessage.id._serialized
            });

            return {
                success: true,
                messageId: sentMessage.id._serialized
            };
        } catch (error) {
            this.logger.error(`Error sending message to ${dto.telefono}:`, error);
            return {
                success: false,
                error: error.message,
                details: error.stack
            };
        }
    }

    // --- Media Sending --- //
    async sendMedia(dto: SendMediaDto): Promise<any> {
        const queue = this.messageQueues.get(`${dto.ideEmpr}`);
        if (!queue) throw new Error(`No client initialized for company ${dto.ideEmpr}`);

        return queue.add(() => this.unsafeSendMedia(dto));
    }

    private async unsafeSendMedia(dto: SendMediaDto): Promise<SendMessageResponse> {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }

        const chatId = this.formatPhoneNumber(dto.telefono);
        const media = this.createMediaInstance(dto);
        const options = this.getMediaOptions(dto);

        if (dto.type === 'sticker') options['sendMediaAsSticker'] = true;
        if (dto.type === 'document') options['sendMediaAsDocument'] = true;

        const sentMessage = await instance.client.sendMessage(chatId, media, options);
        instance.lastActivity = new Date();

        this.logger.log(`${dto.type} sent to ${dto.telefono} for company ${dto.ideEmpr}`, {
            messageId: sentMessage.id._serialized
        });

        return {
            success: true,
            messageId: sentMessage.id._serialized
        };
    }

    // --- Location Sending --- //
    async sendLocation(dto: SendLocationDto): Promise<any> {
        const queue = this.messageQueues.get(`${dto.ideEmpr}`);
        if (!queue) throw new Error(`No client initialized for company ${dto.ideEmpr}`);

        return queue.add(() => this.unsafeSendLocation(dto));
    }

    private async unsafeSendLocation(dto: SendLocationDto): Promise<SendMessageResponse> {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }

        this.validateCoordinates(dto.latitude, dto.longitude);

        const chatId = this.formatPhoneNumber(dto.telefono);
        const location = new Location(
            dto.latitude,
            dto.longitude,
            { name: dto.name, address: dto.address }
        );

        const sentMessage = await instance.client.sendMessage(chatId, location);
        instance.lastActivity = new Date();

        this.logger.log(`Location sent to ${dto.telefono} for company ${dto.ideEmpr}`, {
            messageId: sentMessage.id._serialized
        });

        return {
            success: true,
            messageId: sentMessage.id._serialized,
            location: {
                latitude: dto.latitude,
                longitude: dto.longitude
            }
        };
    }

    // --- Contact Management --- //
    async getContactInfo(ideEmpr: string, contactId: string): Promise<any> {
        const instance = await this.getClientInstance(ideEmpr);
        try {
            const contact = await instance.client.getContactById(contactId);
            return {
                id: contact.id._serialized,
                name: contact.name || contact.pushname || contact.number,
                number: contact.number,
                isBusiness: contact.isBusiness,
                isEnterprise: contact.isEnterprise,
                isMe: contact.isMe,
                isMyContact: contact.isMyContact,
                isUser: contact.isUser,
                isWAContact: contact.isWAContact,
                profilePicUrl: await instance.client.getProfilePicUrl(contact.id._serialized)
            };
        } catch (error) {
            this.logger.error(`Error getting contact info for company ${ideEmpr}:`, error);
            throw error;
        }
    }

    async getProfilePic(ideEmpr: string, contactId: string): Promise<string | null> {
        const instance = await this.getClientInstance(ideEmpr);
        try {
            return await instance.client.getProfilePicUrl(contactId);
        } catch (error) {
            this.logger.error(`Error getting profile picture for company ${ideEmpr}:`, error);
            return null;
        }
    }

    // --- Chat Management --- //
    async getChats(dto: GetChatsWebDto) {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }

        const allChats = await instance.client.getChats();
        const sortedChats = allChats.sort((a, b) =>
            (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0)
        );

        let startIndex = 0;
        if (dto.beforeId) {
            startIndex = sortedChats.findIndex(c => c.id._serialized === dto.beforeId) + 1;
            if (startIndex === 0) startIndex = sortedChats.length;
        }

        const paginatedChats = sortedChats.slice(startIndex, startIndex + dto.limit);

        return Promise.all(paginatedChats.map(async chat => ({
            ide_whcha: chat.id._serialized,
            fecha_crea_whcha: fTimestampToISODate(chat.lastMessage?.timestamp) || Date.now(),
            fecha_msg_whcha: fTimestampToISODate(chat.lastMessage?.timestamp) || Date.now(),
            name_whcha: chat.name,
            nombre_whcha: chat.name,
            phone_number_whcha: instance.client.info.wid.user,
            leido_whcha: chat.unreadCount === 0,
            favorito_whcha: false,
            wa_id_whmem: chat.id.user,
            id_whmem: chat.id._serialized,
            wa_id_context_whmem: null,
            body_whmem: chat.lastMessage?.body?.substring(0, 50) || '',
            fecha_whmem: fTimestampToISODate(chat.lastMessage?.timestamp),
            content_type_whmem: chat.lastMessage?.type,
            status_whmem: null,
            direction_whmem: chat.lastMessage?.fromMe === false,
            no_leidos_whcha: chat.unreadCount,
            is_group: chat.isGroup,
            contact: await this.getContactInfo(`${dto.ideEmpr}`, chat.id._serialized),
        })));
    }

    async getMessages(dto: GetMessagesWebDto) {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }
        const { chatId, limit, beforeId } = dto;
        const chat = await instance.client.getChatById(chatId);
        const fetchOptions: any = { limit };
        if (beforeId) fetchOptions.before = beforeId;

        const rawMessages = await chat.fetchMessages(fetchOptions);
        const processedMessages = await Promise.all(
            rawMessages.map(async msg => this.processMessageForDisplay(msg, instance))
        );

        return {
            messages: processedMessages,
            hasMore: rawMessages.length === limit,
        };
    }

    private async processMessageForDisplay(msg: Message, instance: WhatsAppClientInstance): Promise<any> {
        const contact = await msg.getContact();
        const chat = await msg.getChat();

        const baseMessage = {
            uuid: msg.id._serialized,
            phone_number_id_whmem: msg.from,
            phone_number_whmem: instance.client.info.wid.user,
            wa_id_whmem: chat.id.user,
            body_whmem: msg.body,
            fecha_whmem: fTimestampToISODate(msg.timestamp),
            content_type_whmem: msg.type,
            leido_whmem: msg.isStatus,
            direction_whmem: msg.ack === 0,
            status_whmem: 'delivered',
            timestamp_sent_whmem: fTimestampToISODate(msg.timestamp),
            timestamp_whmem: fTimestampToISODate(msg.timestamp),
            fromMe: msg.fromMe,
            hasMedia: msg.hasMedia,
            isStatus: msg.isStatus,
            isGroupMsg: chat.isGroup,
            senderName: contact.pushname || contact.number,
        };

        if (msg.type === 'location') {
            return {
                ...baseMessage,
                location: {
                    lat: msg.location.latitude,
                    lng: msg.location.longitude,
                    description: msg.location.options?.name
                }
            };
        }

        return baseMessage;
    }



    // --- Public API --- //
    async getStatus(dto: ServiceDto): Promise<StatusResponse> {
        if (!this.clients.has(`${dto.ideEmpr}`)) {
            return {
                status: 'disconnected',
                isOnline: false,
                lastQr: null,
                connectionAttempts: 0,
                lastActivity: null,
                queueStatus: {
                    size: 0,
                    pending: 0,
                    isPaused: false
                }
            };
        }

        const instance = this.clients.get(`${dto.ideEmpr}`);
        const queue = this.messageQueues.get(`${dto.ideEmpr}`);

        return {
            status: instance.status,
            isOnline: instance.status === 'ready',
            lastQr: instance.qrCode,
            connectionAttempts: instance.connectionAttempts,
            lastActivity: instance.lastActivity,
            queueStatus: {
                size: queue?.size || 0,
                pending: queue?.pending || 0,
                isPaused: queue?.isPaused || false
            }
        };
    }

    async getQrCode(dto: ServiceDto) {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        return instance.status === 'qr'
            ? { qr: instance.qrCode, status: 'qr-pending' }
            : { qr: null, status: instance.status };
    }

    onEvent(ideEmpr: string, event: WhatsAppEvent, listener: (data: any) => void) {
        if (!this.clients.has(ideEmpr)) {
            throw new Error(`No client initialized for company ${ideEmpr}`);
        }

        const instance = this.clients.get(ideEmpr);
        instance.eventEmitter.on(event, listener);

        return () => instance.eventEmitter.off(event, listener);
    }

    async logout(dto: ServiceDto) {
        if (this.clients.has(`${dto.ideEmpr}`)) {
            const instance = this.clients.get(`${dto.ideEmpr}`);
            await instance.client.logout();
            instance.eventEmitter.removeAllListeners();
            this.clients.delete(`${dto.ideEmpr}`);
            this.messageQueues.delete(`${dto.ideEmpr}`);
            this.logger.log(`WhatsApp client logged out for company ${dto.ideEmpr}`);
        }
    }


    

    // --- Utility Methods --- //
    private formatPhoneNumber(phoneNumber: string): string {
        return phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
    }

    private validateCoordinates(latitude: number, longitude: number): void {
        if (isNaN(latitude) || isNaN(longitude) ||
            latitude < -90 || latitude > 90 ||
            longitude < -180 || longitude > 180) {
            throw new Error('Invalid coordinates');
        }
    }

    private createMediaInstance(mediaMessage: SendMediaDto): MessageMedia {
        const mimeType = detectMimeType(mediaMessage.filename) ||
            getDefaultMimeType(mediaMessage.type);

        return new MessageMedia(
            mimeType,
            this.normalizeBuffer(mediaMessage.file),
            mediaMessage.filename || generateFilename(mediaMessage.type)
        );
    }

    private normalizeBuffer(data: Buffer | string): string {
        if (Buffer.isBuffer(data)) return data.toString('base64');
        if (typeof data === 'string' && data.startsWith('data:')) {
            return data.split(',')[1];
        }
        return data;
    }

    private getMediaOptions(mediaMessage: SendMediaDto): any {
        const options: any = { caption: mediaMessage.caption };

        if (mediaMessage.type === 'sticker') {
            options.sendMediaAsSticker = true;
        } else if (mediaMessage.type === 'document') {
            options.sendMediaAsDocument = true;
        }

        return options;
    }

    private async processMedia(message: Message) {
        try {
            const media = await message.downloadMedia();
            return media ? {
                mimeType: media.mimetype,
                data: media.data,
                filename: media.filename
            } : null;
        } catch (error) {
            this.logger.error('Error processing media:', error);
            return null;
        }
    }
}