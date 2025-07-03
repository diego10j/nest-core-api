import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Chat, Client, LocalAuth, Location, Message, } from "whatsapp-web.js";
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import * as qrcode from 'qrcode-terminal';
import PQueue from 'p-queue';
import { WHATSAPP_CONFIG, WEB_VERSION_CACHE } from './config';
import {
    WhatsAppEvent,
    MessageData,
    StatusResponse,
    SendMessageResponse,
    WhatsAppClientInstance,
    AccountConfig,
} from './interface/whatsapp-web.interface';
import { QueryOptionsDto } from "src/common/dto/query-options.dto";
import { fTimestampToISODate } from "src/util/helpers/date-util";
import { EnviarUbicacionDto } from "./dto/send-location.dto";
import { GetChatsDto } from "../dto/get-chats.dto";
import { GetMensajesDto } from "../dto/get-mensajes.dto";
import { EnviarMensajeDto } from "../dto/enviar-mensaje.dto";
import { WhatsappDbService } from "../whatsapp-db.service";
import { SearchChatDto } from "../dto/search-chat.dto";
import { WhatsappGateway } from "../whatsapp.gateway";
import {
    createMediaInstance,
    formatPhoneNumber,
    getFileExtension,
    getMediaOptions,
    getMediaTypeFromMime,
    getStatusMessage,
    validateCoordinates,
    validateMediaType
} from "./helper/util";
import { UploadMediaDto } from "../dto/upload-media.dto";
import { FileTempService } from "src/core/sistema/files/file-temp.service";
import { MediaFile } from "../api/interface/whatsapp";
import { isDefined } from "class-validator";
import { HttpService } from "@nestjs/axios";
import { Response } from "express";
import { HeaderParamsDto } from "src/common/dto/common-params.dto";



@Injectable()
export class WhatsappWebService implements OnModuleInit {
    private readonly logger = new Logger(WhatsappWebService.name);
    private clients: Map<string, WhatsAppClientInstance> = new Map();
    private messageQueues: Map<string, PQueue> = new Map();


    constructor(
        private readonly httpService: HttpService,
        private readonly whatsappDb: WhatsappDbService,
        private readonly fileTempService: FileTempService,
        private readonly whatsappGateway: WhatsappGateway  // Inyectamos el gateway
    ) {
    }


    async onModuleInit() {
        await this.initializeSession();
        // Inicia sessiones de cuentas habilitadas para whatsapp web
        const empresasActivas = await this.whatsappDb.getCuentaHabilitadas();
        for (const empresa of empresasActivas) {
            try {
                this.logger.log(`Iniciando WhatsApp web para empresa ${empresa.ide_empr}`);
                await this.createClientInstance(`${empresa.ide_empr}`);
            } catch (err) {
                this.logger.error(`Error al inicializar WhatsApp para empresa ${empresa.ideEmpr}:`, err);
            }
        }
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
        const cuenta = await this.getAccountConfig(Number(ideEmpr));

       if(cuenta){
        const client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, '..', '..', WHATSAPP_CONFIG.sessionPath, ideEmpr),
                clientId: cuenta.id_cuenta_whcue
            }),
            puppeteer: {
                headless: true,
                args: WHATSAPP_CONFIG.puppeteerArgs,
                executablePath: '/usr/bin/chromium'
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

        this.setupEventHandlers(ideEmpr, instance , cuenta);
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
    }

    private async getAccountConfig(ideEmpr: number): Promise<AccountConfig> {
        
        const res = await this.whatsappDb.getCuenta(ideEmpr)
        if ( res) {
            return {
                id_cuenta_whcue: `account_${ideEmpr}`,
                id_telefono_whcue : res.id_telefono_whcue,
                id_empr: ideEmpr,
                nombre_whcue: res.nombre_whcue
                // otros campos necesarios...
            };
        }
        return undefined;
    }

    private createMessageQueue(): PQueue {
        return new PQueue({
            concurrency: 1,
            interval: 60000 / WHATSAPP_CONFIG.maxMessagesPerMinute,
            intervalCap: 1
        });
    }

    private setupEventHandlers(ideEmpr: string, instance: WhatsAppClientInstance, cuenta: AccountConfig) {
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

        client.on('ready', async () => {
            const currentNumber = client.info?.wid?.user || '';
            if (currentNumber!==cuenta.id_telefono_whcue) {
                this.logger.error(`Número no autorizado conectado: ${currentNumber} empresa ${cuenta.nombre_whcue}`);
                 // Desconexión segura
                 // await client.logout();
                 // instance.status = 'unauthorized';
                //  eventEmitter.emit('auth_error', {
                //      type: 'UNAUTHORIZED_NUMBER',
                //      message: 'Número no autorizado',
                //      currentNumber,                     
                //  });
                 // Opcional: Limpiar la sesión
                 // await this.clearSession(ideEmpr);
                // return;
            }
            
            instance.status = 'ready';
            instance.lastActivity = new Date();
            this.logger.log(`Client is ready for company ${ideEmpr}`);
        });

        client.on('disconnected', (reason) => {
            instance.status = 'disconnected';
            this.logger.warn(`Client disconnected for company ${ideEmpr}: ${reason}`);
            this.attemptReconnection(ideEmpr);
        });

        client.on('auth_failure', async (msg) => {
            this.logger.error(`Authentication failure for company ${ideEmpr}:`, msg);
            instance.status = 'disconnected';
            await this.clearSession(ideEmpr);
            this.attemptReconnection(ideEmpr);
        });

        // Manejar cambios de estado para detectar conflictos
        client.on('change_state', async (state) => {
            if (state === 'CONFLICT' || state === 'UNPAIRED') {
                this.logger.warn(`State changed to ${state} for company ${ideEmpr}`);
                const currentNumber = client.info?.wid?.user || '';                             
                if (currentNumber !== cuenta.id_telefono_whcue) {
                    await client.logout();
                    instance.status = 'unauthorized';
                }
            }
        });

        client.on('message', (message) => this.processIncomingMessage(ideEmpr, message));
        client.on('message_create', (message) => {
            if (message.fromMe) { // mensajes enviados por el cliente
                this.processIncomingMessage(ideEmpr, message);
            }
        });
        client.on('message_ack', (message, ack) => {
            if ( ack === 3) { // 3 indicates the message was read    message.fromMe && 
            this.whatsappGateway.sendReadMessageToClients(message.id._serialized);
            }
        });
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
                    await instance.client.destroy(); // Destruye el cliente previo
                    this.clients.delete(ideEmpr); // Elimina la instancia actual
                    const newInstance = await this.createClientInstance(ideEmpr);
                    this.clients.set(ideEmpr, newInstance);
                } catch (error) {
                    this.logger.error(`Reconnection failed for company ${ideEmpr}:`, error);
                    this.attemptReconnection(ideEmpr); // Sigue intentando
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

            // Excluir mensajes de estado
            if (message.from === 'status@broadcast') return;

            const contact = await message.getContact();
            const chat = await message.getChat();
            instance.lastActivity = new Date();
            // console.log(message);

            const messageData: MessageData = {
                from: message.from,
                senderName: contact.pushname || contact.number,
                body: message.body,
                timestamp: message.timestamp,
                isGroup: chat.isGroup,
                chatName: chat.isGroup ? chat.name : null,
                messageId: message.id._serialized,
                hasMedia: message.hasMedia,
            };

            instance.eventEmitter.emit('message', messageData);
            this.whatsappGateway.sendMessageToClients(message.id._serialized);
        } catch (error) {
            this.logger.error(`Error processing message for company ${ideEmpr}:`, error);
        }
    }



    // --- Message Sending --- //
    async enviarMensajeTexto(dto: EnviarMensajeDto & HeaderParamsDto ): Promise<any> {
        const queue = this.messageQueues.get(`${dto.ideEmpr}`);
        if (!queue) throw new Error(`No client initialized for company ${dto.ideEmpr}`);

        return queue.add(() => this.unsafeSendMessage(dto));
    }

    private async unsafeSendMessage(dto: EnviarMensajeDto & HeaderParamsDto): Promise<SendMessageResponse> {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }
        try {
            const chatId = formatPhoneNumber(dto.telefono);
            const sentMessage = await instance.client.sendMessage(chatId, dto.texto)
            instance.lastActivity = new Date();
            this.logger.log(`Message sent to ${dto.telefono} for company ${dto.ideEmpr}`, {
                messageId: sentMessage.id._serialized
            });
            await this.whatsappDb.saveMensajeEnviadoWeb(sentMessage,dto.emitSocket);
            this.whatsappGateway.sendMessageToClients(sentMessage.id._serialized);
            return {
                success: true,
                messageId: sentMessage.id._serialized
            };
        } catch (error) {
            this.logger.error(`Error sending message to ${dto.telefono}: ${error.message}`, error);
            return {
                success: false,
                error: error.message,
                details: error.stack
            };
        }
    }


    // --- Media Sending --- //
    async enviarMensajeMedia(dto: UploadMediaDto  & HeaderParamsDto , file: Express.Multer.File): Promise<any> {
        const queue = this.messageQueues.get(`${dto.ideEmpr}`);
        if (!queue) throw new Error(`No client initialized for company ${dto.ideEmpr}`);

        return queue.add(() => this.unsafeSendMedia(dto, file));
    }

    private async unsafeSendMedia(dto: UploadMediaDto  & HeaderParamsDto , file: Express.Multer.File): Promise<SendMessageResponse> {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }

        try {
            dto.type = getMediaTypeFromMime(file.mimetype);
            const chatId = formatPhoneNumber(dto.telefono);
            const media = createMediaInstance(dto, file);
            const options = getMediaOptions(dto);


            // Validación adicional del tipo de archivo
            validateMediaType(file.mimetype, dto.type);
            const sentMessage = await instance.client.sendMessage(chatId, media, options);
            instance.lastActivity = new Date();

            this.logger.log(`${dto.type} sent to ${dto.telefono} for company ${dto.ideEmpr}`, {
                messageId: sentMessage.id._serialized
            });

            await this.whatsappDb.saveMensajeEnviadoWeb(sentMessage, dto.emitSocket ,file.originalname);

            return {
                success: true,
                messageId: sentMessage.id._serialized
            };
        } catch (error) {
            this.logger.error(`Error sending media to ${dto.telefono}: ${error.message}`);
            throw new Error(`Failed to send media: ${error.message}`);
        }
    }

    // --- Location Sending --- //
    async enviarUbicacion(dto: EnviarUbicacionDto  & HeaderParamsDto): Promise<any> {
        const queue = this.messageQueues.get(`${dto.ideEmpr}`);
        if (!queue) throw new Error(`No client initialized for company ${dto.ideEmpr}`);

        return queue.add(() => this.unsafeSendLocation(dto));
    }

    private async unsafeSendLocation(dto: EnviarUbicacionDto  & HeaderParamsDto): Promise<SendMessageResponse> {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }

        validateCoordinates(dto.latitude, dto.longitude);

        const chatId = formatPhoneNumber(dto.telefono);
        const location = new Location(
            dto.latitude,
            dto.longitude,
            { name: dto.name, address: dto.address }
        );

        const sentMessage = await instance.client.sendMessage(chatId, location);
        instance.lastActivity = new Date();
        await this.whatsappDb.saveMensajeEnviadoWeb(sentMessage,dto.emitSocket);
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
    async getContactInfo(ideEmpr: number, contactId: string): Promise<any> {
        const instance = await this.getClientInstance(`${ideEmpr}`);
        try {
            const contact = await instance.client.getContactById(contactId);
            return {
                id: contact.id._serialized,
                name: contact.name || contact.pushname || contact.number,
                pushname: contact.pushname,
                number: contact.number,
                isBusiness: contact.isBusiness,
                isEnterprise: contact.isEnterprise,
                isMe: contact.isMe,
                isMyContact: contact.isMyContact,
                isUser: contact.isUser,
                isWAContact: contact.isWAContact,
                type: contact.type,
                labels: contact.labels,
               // profilePicUrl: await instance.client.getProfilePicUrl(contact.id._serialized)
            };
        } catch (error) {
            this.logger.error(`Error getting contact info for company ${ideEmpr}:`, error);
            throw error;
        }
    }


    async getProfilePicUrl(ideEmpr: string, contactId: string): Promise<string | null> {
        const instance = await this.getClientInstance(ideEmpr);
        try {
            return await instance.client.getProfilePicUrl(contactId);
        } catch (error) {
            this.logger.error(`Error getting profile picture for company ${ideEmpr}:`, error);
            return null;
        }
    }

    // --- Chat Management --- //
    async getChats(dto: GetChatsDto  & HeaderParamsDto) {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }

        const allChats = await instance.client.getChats();

        // Filtro principal
        const filteredChats = allChats.filter(chat => {
            // 1. Excluir grupos
            if (chat.isGroup) return false;

            // 2. Excluir mensajes del sistema de WhatsApp (ID '0' o 'status@broadcast')
            if (chat.id.user === '0' || chat.id._serialized.includes('status@broadcast')) return false;

            // 3. Excluir mensajes de notificaciones o invitaciones 
            if (chat.lastMessage?.type === 'notification_template' ||
                chat.lastMessage?.type === 'groups_v4_invite' // || chat.lastMessage?.type === 'call_log'
            ) {
                return false;
            }

            // 4. Asegurarse que tiene último mensaje (opcional)
            if (!chat.lastMessage) return false;

            return true;
        });

        // console.log("Chats filtrados:", filteredChats.length); // Debug

        const sortedChats = filteredChats.sort((a, b) =>
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
            leido_whmem: !chat.lastMessage?.fromMe && chat.lastMessage?.ack === 3, // 3: Read
            direction_whmem: chat.lastMessage?.fromMe ? '1' : 'o', // 0: Sent, 1: Received
            status_whmem: getStatusMessage(chat.lastMessage?.ack),
            no_leidos_whcha: chat.unreadCount,
            is_group: chat.isGroup, // Aunque estamos filtrando, mantenemos la propiedad por si acaso
            // chat
            // profilePicUrl: await instance.client.getProfilePicUrl(chat.id._serialized)
            // contact: await this.getContactInfo(`${dto.ideEmpr}`, chat.id._serialized),
        })));
    }

    async getMensajes(dto: GetMensajesDto & HeaderParamsDto) {
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
            rawMessages.map(async msg => this.processMessageForDisplay(chat, msg, instance))
        );

        // return {
        //     messages: processedMessages,
        //     hasMore: rawMessages.length === limit,
        // };
        return processedMessages
    }

    private async processMessageForDisplay(chat: Chat, msg: Message, instance: WhatsAppClientInstance): Promise<any> {
        // const contact = await msg.getContact();


        const baseMessage = {
            uuid: msg.id._serialized,
            phone_number_id_whmem: msg.from,
            phone_number_whmem: instance.client.info.wid.user,
            wa_id_whmem: chat.id.user,
            body_whmem: msg.body,
            fecha_whmem: fTimestampToISODate(msg.timestamp),
            content_type_whmem: msg.type,
            leido_whmem: !msg.fromMe && msg.ack === 3, // 3: Read
            direction_whmem: msg.fromMe ? '1' : 'o', // 0: Sent, 1: Received
            status_whmem: getStatusMessage(msg.ack),
            timestamp_sent_whmem: fTimestampToISODate(msg.timestamp),
            timestamp_whmem: fTimestampToISODate(msg.timestamp),
            attachment_id_whmem: msg.id._serialized,
            fromMe: msg.fromMe,
            hasMedia: msg.hasMedia,
            isStatus: msg.isStatus,
            isForwarded: msg.isForwarded,
            forwardingScore: msg.isForwarded,
            isGroupMsg: chat.isGroup,
            senderName: chat.name,
            location: msg.location,
            // data:  msg['_data'],
            // Nuevos campos para multimedia
            mediaInfo: msg.hasMedia ? {
                deprecatedMms3Url: msg['_data']?.deprecatedMms3Url,
                mimetype: msg['_data']?.mimetype,
                filename: msg['_data']?.filename,
                // filehash: msg['_data']?.filehash,
                // encFilehash: msg['_data']?.encFilehash,
                size: msg['_data']?.size,
                mediaKey: msg['_data']?.mediaKey,
                // mediaKeyTimestamp: msg['_data']?.mediaKeyTimestamp,
                duration: msg['_data']?.duration,
                width: msg['_data']?.width,
                height: msg['_data']?.height,
                isViewOnce: msg['_data']?.isViewOnce,
                caption: msg['_data']?.caption
            } : null,
        };

        if (msg.type === 'location') {
            return {
                ...baseMessage,
                location: {
                    lat: msg.location.latitude,
                    lng: msg.location.longitude,
                    // description: msg.location.options?.name
                }
            };
        }

        return baseMessage;
    }



    // --- Public API --- //
    async getStatus(dto: QueryOptionsDto  & HeaderParamsDto): Promise<StatusResponse> {
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
            }, 
            info: instance.client.info
        };
    }

    async getQrCode(dto: QueryOptionsDto  & HeaderParamsDto) {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        return instance.status === 'qr'
            ? { qr: instance.qrCode, status: 'qr-pending' }
            : { qr: null, status: instance.status };
    }


    async validateWhatsAppNumber(
        ideEmpr: number, 
        phoneNumber: string
    ): Promise<{ isValid: boolean; formattedNumber?: string; error?: string }> {
        const instance = await this.getClientInstance(`${ideEmpr}`);
        
        try {
            // Formatea el número (elimina caracteres no numéricos y añade código de país si es necesario)
            const formattedNumber = formatPhoneNumber(phoneNumber); // Asume que tienes esta función
            
            // Verifica si el número está registrado en WhatsApp
            const numberId = await instance.client.getNumberId(formattedNumber);
            
            if (numberId) {
                return {
                    isValid: true,
                    formattedNumber: numberId._serialized,
                };
            } else {
                return {
                    isValid: false,
                    formattedNumber,
                    error: "El número no está registrado en WhatsApp.",
                };
            }
        } catch (error) {
            this.logger.error(
                `Error al validar número ${phoneNumber} para empresa ${ideEmpr}:`,
                error
            );
            
            return {
                isValid: false,
                error: "Error al validar el número. Por favor, inténtalo de nuevo.",
            };
        }
    }


    onEvent(ideEmpr: string, event: WhatsAppEvent, listener: (data: any) => void) {
        if (!this.clients.has(ideEmpr)) {
            throw new Error(`No client initialized for company ${ideEmpr}`);
        }

        const instance = this.clients.get(ideEmpr);
        instance.eventEmitter.on(event, listener);

        return () => instance.eventEmitter.off(event, listener);
    }

    async logout(dto: QueryOptionsDto  & HeaderParamsDto) {
        if (this.clients.has(`${dto.ideEmpr}`)) {
            const instance = this.clients.get(`${dto.ideEmpr}`);
            await instance.client.logout();
            instance.eventEmitter.removeAllListeners();
            this.clients.delete(`${dto.ideEmpr}`);
            this.messageQueues.delete(`${dto.ideEmpr}`);
            this.logger.log(`WhatsApp client logged out for company ${dto.ideEmpr}`);
            this.clearSession(`${dto.ideEmpr}`);
            return {message:'ok'}
        }
        else{
            throw new BadRequestException(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }
    }


    async searchContacto(dto: SearchChatDto & HeaderParamsDto): Promise<any[]> {
        const instance = await this.getClientInstance(`${dto.ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new BadRequestException(`WhatsApp client is not ready for company ${dto.ideEmpr}`);
        }

        if (dto.texto.trim() === '') {
            return [];
        }

        try {
            const limit = dto.resultados || 25;
            const allContacts = await instance.client.getContacts();

            // Filtrar contactos que coincidan con la búsqueda y sean @c.us
            const filteredContacts = allContacts.filter(contact => {
                const isIndividualContact = contact.id._serialized.endsWith('@c.us');
                const matchesSearch = (
                    contact.name?.toLowerCase().includes(dto.texto.toLowerCase()) ||
                    contact.pushname?.toLowerCase().includes(dto.texto.toLowerCase()) ||
                    contact.number?.includes(dto.texto)
                );

                return isIndividualContact && matchesSearch;
            });

            // Limitar los resultados
            const limitedContacts = filteredContacts.slice(0, limit);

            // Procesar los contactos seleccionados
            return Promise.all(limitedContacts.map(async contact => ({
                ide_whcha: contact.id._serialized,
                nombre_whcha: contact.name || contact.pushname || contact.number,
                name_whcha: contact.pushname,
                wa_id_whmem: contact.number,
                isBusiness: contact.isBusiness,
                isEnterprise: contact.isEnterprise,
                isMyContact: contact.isMyContact,
                profilePicUrl: await instance.client.getProfilePicUrl(contact.id._serialized)
            })));
        } catch (error) {
            this.logger.error(`Error searching contacts for company ${dto.ideEmpr}:`, error);
            throw error;
        }
    }

    private async clearSession(ideEmpr: string) {
        const sessionDir = path.join(__dirname, '..', '..', WHATSAPP_CONFIG.sessionPath, ideEmpr);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            this.logger.warn(`Session directory cleared for company ${ideEmpr}`);
        }
    }



    async download(ideEmpr: string, messageId: string): Promise<MediaFile> {       
        // 1. Verificar existencia del archivo en BD
        const resFile = await this.whatsappDb.getFile(messageId);
        if (resFile) {
            const {
                attachment_name_whmem: filename,
                attachment_size_whmem: filesize,
                attachment_type_whmem: contentType,
                attachment_url_whmem: existingUrl
            } = resFile;
            // Si ya tiene URL, retornar los datos existentes
            if (isDefined(existingUrl)) {
                return {
                    url: existingUrl,
                    data: null, // No descargamos los datos nuevamente
                    mimeType: contentType,
                    fileSize: filesize,
                    fileName: filename
                };
            }
        }

        const instance = await this.getClientInstance(`${ideEmpr}`);
        if (instance.status !== 'ready') {
            throw new Error(`WhatsApp client is not ready for company ${ideEmpr}`);
        }
        const message: Message = await instance.client.getMessageById(messageId);
        if (!message) {
            throw new Error('Message not found');
        }

        try {
            const media = await message.downloadMedia();
            if (!media) {
                throw new Error('Media not available');
            }

            // Determinar extensión del archivo
            const extension = getFileExtension(media.mimetype, media.filename);
            // Guardar en archivo temporal
            const buffer = Buffer.from(media.data, 'base64');
            const { fileName } = await this.fileTempService.saveTempFile(buffer, extension);


            // 6. Actualizar la base de datos con la nueva información
            await this.whatsappDb.updateUrlFile(messageId, fileName);
            return {
                url: fileName,
                mimeType: media.mimetype,
                fileName: media.filename || `${uuidv4()}.${extension}`
            };
        } catch (error) {
            this.logger.error('Error downloading media:', error);
            // throw new Error('Failed to download media');
            return undefined;
        }
    }



    /**
    * Obtiene o crea la imagen de perfil y la sirve
    * @param ideEmpr Identificador de empresa
    * @param contactId Identificador de contacto
    * @param response Objeto Response de Express
    */
    async getOrCreateProfilePicture(
        ideEmpr: string,
        contactId: string,
        response: Response
    ) {
        const filename = `${contactId}.jpg`; // Asumimos formato JPG
        const fileExists = await this.fileTempService.fileExists(filename);
        if (!fileExists) {
            await this.createProfilePictureFile(ideEmpr, contactId, filename);
        }

        return this.fileTempService.downloadFile(response, filename);
    }

    /**
    * Crea el archivo de imagen de perfil
    * @param ideEmpr Identificador de empresa
    * @param contactId Identificador de contacto
    * @param filename Nombre del archivo a crear
    */
    private async createProfilePictureFile(
        ideEmpr: string,
        contactId: string,
        filename: string
    ) {
        try {
            const profilePicUrl = await this.getProfilePicUrl(ideEmpr, contactId);
            if (!profilePicUrl) {
                this.logger.error(`No se pudo obtener la imagen de perfil ${contactId}`);
                return undefined;
                // throw new NotFoundException('No se pudo obtener la imagen de perfil');
            }
            // Descargar la imagen
            const response = await this.httpService.axiosRef.get(profilePicUrl, {
                responseType: 'arraybuffer'
            });
            // Guardar en archivo temporal
            await this.fileTempService.saveTempFile(
                Buffer.from(response.data, 'binary'),
                path.extname(filename).substring(1), // Extraer extensión
                filename
            );
        } catch (error) {
            this.logger.error(`Error creating profile picture for ${contactId}:`, error);
            throw error;
        }
    }
}


// async getQrCode(dto: QueryOptionsDto) {
//     return 'ok'
    
//     const instance = await this.getClientInstance(`${dto.ideEmpr}`);
//     return {ok:'ok'}
//     if (instance.status === 'qr') {
//         // Verifica que qrCode sea un string no vacío
//         if (!instance.qrCode || typeof instance.qrCode !== 'string') {
//             throw new Error('QR code data is invalid');
//         }

//         try {
//             const qrCodeImageBuffer = await qrcode.toBuffer(instance.qrCode);
//             const fileName = `qr_${dto.ideEmpr}.png`;
//             await this.fileTempService.saveTempFile(qrCodeImageBuffer, 'png', fileName);
//             return { qr: instance.qrCode, status: 'qr-pending', fileName };
//         } catch (error) {
//             console.error('Error generating QR buffer:', error);
//             return {er:error}
//             throw new Error('Failed to generate QR code image');
//         }
//     }
//     return { qr: null, status: instance.status };
// }