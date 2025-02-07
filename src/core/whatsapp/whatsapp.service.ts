import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { ServiceDto } from 'src/common/dto/service.dto';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { lastValueFrom } from 'rxjs';
import { InsertQuery, SelectQuery, UpdateQuery } from '../connection/helpers';
import { getCurrentDateTime } from '../../util/helpers/date-util';
import { envs } from 'src/config/envs';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import * as FormData from 'form-data';
import { WhatsappGateway } from './whatsapp.gateway';
import { ListaDto } from './dto/lista.dto';

@Injectable()
export class WhatsappService {

    private WHATSAPP_API_URL: string;
    private WHATSAPP_ID: string;
    private WHATSAPP_TOKEN: string;
    private readonly logger = new Logger(WhatsappService.name);

    constructor(private readonly httpService: HttpService,
        private readonly dataSource: DataSourceService,
        private readonly whatsappGateway: WhatsappGateway  // Inyectamos el gateway
    ) {
        // Recupera valores variables de entorno
        this.WHATSAPP_API_URL = envs.whatsappApiUrl;
        this.WHATSAPP_ID = envs.whatsappApiId;
        this.WHATSAPP_TOKEN = envs.whatsappApiToken;
    }


    //--------------------------------------API
    /**
    * Consume Api Whatsapp para enviar mensaje
    * @param data
    */
    async sendMessageWhatsApp(data: any) {
        const URL = `${this.WHATSAPP_API_URL}/${this.WHATSAPP_ID}/messages`;

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

    async sendMediaWhatsApp(file: Express.Multer.File) {
        const URL = `${this.WHATSAPP_API_URL}/${this.WHATSAPP_ID}/media`;

        // Primero, subimos la imagen a los servidores de WhatsApp
        const formData = new FormData();
        formData.append("file", file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
        });
        formData.append("messaging_product", "whatsapp");
        const requestConfig: AxiosRequestConfig = {
            headers: {
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`,
                ...formData.getHeaders(),
            }
        };
        try {
            const resp = await this.httpService.axiosRef.post(URL, formData, requestConfig);
            console.log(resp.data);
            return resp.data.id; // Retorna el media_id
        } catch (error) {
            console.error("❌ Error en sendMediaWhatsApp:", error.response?.data || error.message);
            throw new InternalServerErrorException(
                `[ERROR]: sendMediaWhatsApp ${JSON.stringify(error.response?.data || error.message)}`
            );
        }
    }


    async getProfilePictureUrl(dto: GetMensajesDto) {
        const URL = `${this.WHATSAPP_API_URL}/${this.WHATSAPP_ID}/contacts?contact_ids=${dto.telefono}&fields=profile_picture_url&access_token=${this.WHATSAPP_TOKEN}`;
        try {
            const resp = await this.httpService.axiosRef.get(URL);
            return resp.data;
        } catch (error) {
            console.error("❌ Error en getProfilePictureUrl:", error.response?.data || error.message);
            throw new InternalServerErrorException(
                `[ERROR]: getProfilePictureUrl ${error}`
            );
        }
    }

    /**
     * Guarda los mensajes recibidos por el API de Whatsapp 
     *  @param body 
     */
    async saveReceivedMessage(body: any) {
        if (!body || !body) {
            this.logger.warn('No se encontró ninguna entrada válida en la solicitud.');
            return;
        }
        const { entry } = body;

        if (entry && entry.length > 0 && entry[0].changes && entry[0].changes.length > 0) {
            if (entry[0].changes[0].value.statuses) {
                // actualiza el estado de los mensajes enviados
                const statuses: any = entry[0].changes[0].value.statuses[0];
                if (statuses) {
                    try {
                        const updateQuery = new UpdateQuery('wha_mensaje', 'uuid');
                        updateQuery.values.set("status_whmem", statuses.status);
                        if (statuses.status === 'delivered' || statuses.status === 'sent') {
                            updateQuery.values.set("timestamp_sent_whmem", new Date(statuses.timestamp * 1000).toISOString());
                        }
                        else if (statuses.status === 'read') {
                            updateQuery.values.set("timestamp_read_whmem", new Date(statuses.timestamp * 1000).toISOString());
                            updateQuery.values.set("leido_whmem", true);
                        }
                        updateQuery.where = 'id_whmem = $1';
                        updateQuery.addParam(1, statuses.id);
                        this.dataSource.createQuery(updateQuery);
                    } catch (error) {
                        this.logger.error('Error al actualizar estado del mensaje', error);
                    }
                }
            }
            else {
                // guarda mensaje recibido
                const jsonMsg = JSON.stringify(body);
                try {
                    const query = new SelectQuery(`SELECT mensaje_whatsapp('${jsonMsg}'::jsonb) AS msg`);
                    await this.dataSource.createSingleQuery(query);

                    // Emitir el mensaje a través de WebSocket
                    this.whatsappGateway.sendMessageToClients(body);  // Emitir el mensaje recibido a los clientes WebSocket

                } catch (error) {
                    this.logger.error('Error al guardar el mensaje', error);
                }
            }

        }
        else {
            this.logger.error('El mensaje no cumple con la estructura');
        }
    }

    //--------------------------------------FIN API


    /**
     * Retorna los mensajes de un chat 
     * @param dto 
     * @returns 
     */
    async getMensajes(dto: GetMensajesDto) {
        const query = new SelectQuery(`
        select
            *
        from
            wha_mensaje
        WHERE
            phone_number_id_whmem = $1
        and wa_id_whmem = $2
        order by
            fecha_whmem desc    
        `, dto);
        query.addStringParam(1, this.WHATSAPP_ID);
        query.addParam(2, dto.telefono);
        const data = await this.dataSource.createQuery(query, false);
        return data;
    }


    /**
     * Obtiene todos los mensajes agrupados por número de teléfono
     * @returns Lista de conversaciones agrupadas por número de teléfono
     */
    async getChats(dto: ServiceDto) {
        const query = new SelectQuery(`
        SELECT
            a.ide_whcha,
            fecha_crea_whcha,
            fecha_msg_whcha,
            name_whcha,
            phone_number_whcha,
            leido_whcha,
            favorito_whcha,
            wa_id_whmem,
            id_whmem,
            wa_id_context_whmem,
            body_whmem,
            fecha_whmem,
            content_type_whmem,
            leido_whmem,
            direction_whmem,
            no_leidos_whcha
        FROM
            wha_chat a
            left join wha_mensaje b on a.id_whcha = b.id_whmem
        WHERE phone_number_id_whcha = $1
        order by
            fecha_msg_whcha desc
        `, dto);
        query.addStringParam(1, this.WHATSAPP_ID);
        const data = await this.dataSource.createSelectQuery(query);
        return data;
    }

    /**
     * Retorna las listas de chats
     * @param dto 
     * @returns 
     */
    async getListas(dto: ServiceDto) {
        const query = new SelectQuery(`
        SELECT
            a.ide_whlis,
            a.nombre_whlis,
            a.color_whlis,
            a.descripcion_whlis,
            a.icono_whlis,
            COALESCE(COUNT(wlc.ide_whlis), 0) AS total_chats
        FROM
            wha_lista a
        LEFT JOIN
            wha_lista_chat wlc ON a.ide_whlis = wlc.ide_whlis
        where 
            a.ide_empr = $1
        GROUP BY
            a.ide_whlis, a.nombre_whlis, a.color_whlis, a.descripcion_whlis, a.icono_whlis
        `, dto);
        query.addParam(1, dto.ideEmpr);
        const data = await this.dataSource.createSelectQuery(query);
        return data;
    }



    /**
     * Retorna los Contactos agregados a una lista
     * @param dto 
     * @returns 
     */
    async getContactosLista(dto: ListaDto) {
        const query = new SelectQuery(`
        select
            ide_whlic,
            wa_id_whlic,
            a.hora_ingre,
            nombre_whcha,
            name_whcha
        from
            wha_lista_chat a
            inner join wha_chat b on a.wa_id_whlic = b.wa_id_whcha
        where
            ide_whlis = $1
        order by
            nombre_whcha desc
        `, dto);
        query.addParam(1, dto.ide_whlis);
        const data = await this.dataSource.createSelectQuery(query);
        return data;
    }



    async enviarMensajeTexto(dtoIn: EnviarMensajeDto) {
        const data = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: dtoIn.telefono,
            type: "text",
            text: {
                preview_url: false,
                body: dtoIn.texto
            }
        };
        try {
            const respWts = await this.sendMessageWhatsApp(data);
            // Asigna el id del API para el mensaje
            dtoIn.idWts = respWts.messages[0].id;
            // Guarda el mensaje
            const resp = await this.saveMensajeEnviado(dtoIn);
            return {
                mensaje: 'ok',
                data: resp
            };
        } catch (error) {
            throw new InternalServerErrorException(`[ERROR]: enviarMensaje ${error}`);
        }
    }


    async enviarMensajeImagen(file: Express.Multer.File) {
        try {
            // Subir imagen y obtener media_id
            const mediaId = await this.sendMediaWhatsApp(file);
            const dtoIn: EnviarMensajeDto = {
                telefono: '593983113543',
                tipo: 'image',
                idWts: '',
                mediaId,
                ideUsua: 1,
                ideEmpr: 1,
                ideSucu: 1,
                idePerf: 1,
                login: 'diego'
            }
            // Crear el mensaje de imagen
            const data = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: dtoIn.telefono,
                type: "image",
                image: {
                    id: mediaId, // El ID de la imagen subida a WhatsApp
                    caption: 'Imagen',
                },
            };

            const respWts = await this.sendMessageWhatsApp(data);
            // Asigna el id del API para el mensaje
            dtoIn.idWts = respWts.messages[0].id;
            // Guarda el mensaje
            const resp = await this.saveMensajeEnviado(dtoIn);
            return {
                mensaje: 'ok',
                data: resp
            };
        } catch (error) {
            console.log(error);
            throw new InternalServerErrorException(`[ERROR]: enviarMensajeImagen ${error}`);
        }
    }

    /**
     * Marca como leidos todos los mensajes de un chat
     */
    async setMensajesLeidosChat(dto: GetMensajesDto) {
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('no_leidos_whcha', 0);
        updateQuery.values.set('leido_whcha', true);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, this.WHATSAPP_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery)
    }

    /**
    * Marca como no leido un chat
    */
    async setChatNoLeido(dto: GetMensajesDto) {
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('leido_whcha', false);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, this.WHATSAPP_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery)
    }

    // ---------------------------------------

    /**
     * Guarda un mensaje enviado 
     */
    private async saveMensajeEnviado(dto: EnviarMensajeDto) {
        try {
            // Actualiza último mensaje chat
            const updateQuery = new UpdateQuery('wha_chat', 'ide_whcha');
            updateQuery.values.set("id_whcha", dto.idWts);
            updateQuery.where = 'wa_id_whcha = $1';
            updateQuery.addParam(1, dto.telefono);
            await this.dataSource.createQuery(updateQuery);
            // Guarda mensaje
            const insertQuery = new InsertQuery('wha_mensaje', 'uuid')
            insertQuery.values.set('phone_number_id_whmem', this.WHATSAPP_ID);
            insertQuery.values.set('wa_id_whmem', dto.telefono);
            insertQuery.values.set('id_whmem', dto.idWts);
            insertQuery.values.set('body_whmem', dto.texto || '');
            insertQuery.values.set('fecha_whmem', getCurrentDateTime());
            insertQuery.values.set('content_type_whmem', dto.tipo);
            insertQuery.values.set('leido_whmem', true);
            insertQuery.values.set('direction_whmem', 1);
            //media
            insertQuery.values.set('attachment_id_whmem', dto.mediaId);
            return await this.dataSource.createQuery(insertQuery);
        } catch (error) {
            this.logger.error(`Error saveMensajeEnviado: ${error.message}`);
            throw new InternalServerErrorException(`Error saveMensajeEnviado: ${error.message}`);
        }
    }

    async markMessageAsRead(uuid: string) {
        const updateQuery = new UpdateQuery('this.tableName', 'this.primaryKey');
        updateQuery.values.set('status_chmen', 'read')
        updateQuery.where = 'uuid = $1';
        updateQuery.addParam(1, uuid);
        await this.dataSource.createQuery(updateQuery)
    }

    async markMessageAsPending(uuid: string) {
        const updateQuery = new UpdateQuery('this.tableName', 'this.primaryKey');
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
        const URL = `https://graph.facebook.com/v22.0/${this.WHATSAPP_ID}/messages`;
        const requestConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.WHATSAPP_TOKEN}`
            }
        };


        try {
            const response = await lastValueFrom(this.httpService.post(URL, data, requestConfig));

            const insertQuery = new InsertQuery('', '')
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

}
