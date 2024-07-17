import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { ServiceDto } from 'src/common/dto/service.dto';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { lastValueFrom } from 'rxjs';
import { InsertQuery, SelectQuery, UpdateQuery } from '../connection/helpers';
import { getCurrentDateTime } from '../../util/helpers/date-util';

@Injectable()
export class ChatbotService {

    private WHATSAPP_ID: string;
    private WHATSAPP_TOKEN: string;
    private readonly logger = new Logger(ChatbotService.name);
    private tableName = 'cha_mensajes';

    constructor(private readonly httpService: HttpService,
        private readonly dataSource: DataSourceService
    ) {
        // Recupera valores variables de entorno
        this.WHATSAPP_ID = process.env.WHATSAPP_API_ID;
        this.WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
    }

    /**
     * Envia mensaje de la plantilla activar mensajes
     * @param dtoIn 
     * @returns 
     */
    async activarNumero(dtoIn: MensajeChatDto) {
        const data = JSON.stringify(
            {
                "messaging_product": "whatsapp",
                "to": dtoIn.telefono,
                "type": "template",
                "template": {
                    "name": "activate_msg",
                    "language": {
                        "code": "en_US"
                    }
                }
            }
        );
        const resp = await this.sendMessageWhatsApp(data);
        return {
            mensaje: 'ok',
            data: resp
        }
    }

    /**
     * Envia un mensaje a un numero determinado
     * @param dtoIn 
     * @returns 
     */
    async enviarMensaje(dtoIn: MensajeChatDto) {

        const data = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": dtoIn.telefono,
            "type": "text",
            "text": {
                "preview_url": false,
                "body": dtoIn.mensaje  //"Mensaje de prueba enviado por *ProduBot*"
            }
        };
        const resp = await this.sendMessageWhatsApp(data);
        return {
            mensaje: 'ok',
            data: resp
        }
    }

    /**
    * Consume Api Whatsapp para enviar mensaje
    * @param data
    */
    async sendMessageWhatsApp(data: any) {

        const URL = `https://graph.facebook.com/v17.0/${this.WHATSAPP_ID}/messages`;

        const requestConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`
            }
        };
        try {
            const resp = await this.httpService.axiosRef.post(URL, data, requestConfig);
            return resp.data;
        } catch (error) {
            throw new InternalServerErrorException(
                `[ERROR]: sendMessageWhatsApp ${error}`
            );
        }
    }


    async manejarMensajeEntrante(body: any) {
        const { entry } = body;
        if (entry && entry.length > 0 && entry[0].changes && entry[0].changes.length > 0) {
            const change = entry[0].changes[0];
            const value = change.value;

            if (value && value.messages && value.messages.length > 0) {
                const message = value.messages[0];
                this.logger.log(`Mensaje recibido: ${JSON.stringify(message)}`);

                let attachmentUrl = null;
                let attachmentType = null;

                switch (message.type) {
                    case 'image':
                        attachmentUrl = message.image.url;
                        attachmentType = 'image';
                        break;
                    case 'audio':
                        attachmentUrl = message.audio.url;
                        attachmentType = 'audio';
                        break;
                    case 'location':
                        attachmentUrl = `${message.location.latitude},${message.location.longitude}`;
                        attachmentType = 'location';
                        break;
                    case 'document':
                        attachmentUrl = message.document.url;
                        attachmentType = 'document';
                        break;
                    case 'video':
                        attachmentUrl = message.video.url;
                        attachmentType = 'video';
                        break;
                    case 'contacts':
                        attachmentUrl = JSON.stringify(message.contacts);
                        attachmentType = 'contacts';
                        break;
                    // Añadir más tipos de mensajes según sea necesario
                }
                const insertQuery = new InsertQuery(this.tableName)
                insertQuery.values.set('from_chmen', message.from);
                insertQuery.values.set('to_chmen', this.WHATSAPP_ID);
                insertQuery.values.set('body_chmen', message.text ? message.text.body : null);
                insertQuery.values.set('created_at_chmen', message.timestamp);
                insertQuery.values.set('content_type_chmen', message.type);
                insertQuery.values.set('status_chmen', 'unread');
                insertQuery.values.set('attachment_url_chmen', attachmentUrl);
                insertQuery.values.set('attachment_type_chmen', attachmentType);
                insertQuery.values.set('direction_chmen', 'inbound');
                await this.dataSource.createQuery(insertQuery);
            } else {
                this.logger.warn('No se encontró ningún mensaje en la solicitud entrante.');
            }
        } else {
            this.logger.warn('No se encontró ninguna entrada válida en la solicitud.');
        }
    }

    async getMessages() {
        const query = new SelectQuery(`
            SELECT * FROM ${this.tableName}  ORDER BY created_at_chmen DESC`);
        const { rows } = await this.dataSource.createQuery(query);
        return rows;
    }


    /**
     * Obtiene todos los mensajes agrupados por número de teléfono
     * @returns Lista de conversaciones agrupadas por número de teléfono
     */
    async getConversations() {
        const query = new SelectQuery(`
            SELECT DISTINCT ON (from_chmen) from_chmen, to_chmen, MAX(created_at_chmen) AS last_message_time
            FROM ${this.tableName}
            GROUP BY from_chmen, to_chmen
            ORDER BY last_message_time DESC`);
        const { rows } = await this.dataSource.createQuery(query);
        return rows;
    }


    async getMessagesByPhone(phone: string) {
        const query = new SelectQuery(`
            SELECT * FROM ${this.tableName} 
            WHERE from_chmen = $1 OR to_chmen = $2 
            ORDER BY created_at_chmen DESC
           `);
        query.addStringParam(1, phone);
        query.addStringParam(2, phone);
        const { rows } = await this.dataSource.createQuery(query);

        // Formatear los datos de salida
        // const messages = rows.map(row => ({
        //     id: row.id,
        //     body: row.body,
        //     senderId: row.sender_id,
        //     contentType: row.content_type,
        //     createdAt: row.created_at,
        //     attachments: row.attachment_id ? [{
        //         id: row.attachment_id,
        //         name: row.attachment_name,
        //         size: row.attachment_size,
        //         type: row.attachment_type,
        //         path: row.attachment_path,
        //         preview: row.attachment_preview,
        //         createdAt: row.created_at,
        //         modifiedAt: row.modified_at
        //     }] : []
        // }));

        return rows;
    }

    async markMessageAsRead(uuid: string) {
        const updateQuery = new UpdateQuery(this.tableName);
        updateQuery.values.set('status_chmen', 'read')
        updateQuery.where = 'uuid = $1';
        updateQuery.addParam(1, uuid);
        await this.dataSource.createQuery(updateQuery)
    }

    async markMessageAsPending(uuid: string) {
        const updateQuery = new UpdateQuery(this.tableName);
        updateQuery.values.set("status_chmen", 'pending')
        updateQuery.where = 'uuid = $1';
        updateQuery.addParam(1, uuid);
        await this.dataSource.createQuery(updateQuery)
    }

    async sendMessage(to: string, type: string, content: any) {
        let data: any;
        switch (type) {
            case 'text':
                data = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: content.body
                    }
                };
                break;
            case 'image':
                data = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'image',
                    image: {
                        link: content.link,
                        caption: content.caption
                    }
                };
                break;
            case 'audio':
                data = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'audio',
                    audio: {
                        link: content.link
                    }
                };
                break;
            case 'video':
                data = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'video',
                    video: {
                        link: content.link,
                        caption: content.caption
                    }
                };
                break;
            case 'document':
                data = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'document',
                    document: {
                        link: content.link,
                        caption: content.caption
                    }
                };
                break;
            case 'location':
                data = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'location',
                    location: {
                        latitude: content.latitude,
                        longitude: content.longitude,
                        name: content.name,
                        address: content.address
                    }
                };
                break;
            case 'contacts':
                data = {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'contacts',
                    contacts: content.contacts
                };
                break;
            // Añadir más tipos de mensajes según sea necesario
        }
        const URL = `https://graph.facebook.com/v17.0/${this.WHATSAPP_ID}/messages`;
        const requestConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`
            }
        };


        try {
            const response = await lastValueFrom(this.httpService.post(URL, data, requestConfig));

            const insertQuery = new InsertQuery(this.tableName)
            insertQuery.values.set('from_chmen', this.WHATSAPP_ID);
            insertQuery.values.set('to_chmen', to);
            insertQuery.values.set('body_chmen', content.body || '');
            insertQuery.values.set('created_at_chmen', getCurrentDateTime());
            insertQuery.values.set('content_type_chmen', type);
            insertQuery.values.set('status_chmen', 'read');
            insertQuery.values.set('attachment_url_chmen', content.link || '');
            insertQuery.values.set('attachment_type_chmen', type);
            insertQuery.values.set('direction_chmen', 'outbound');
            await this.dataSource.createQuery(insertQuery);

            return response.data;
        } catch (error) {
            this.logger.error(`Error sending message: ${error.message}`);
            throw new InternalServerErrorException(`Error sending message: ${error.message}`);
        }
    }
}
