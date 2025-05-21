import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { DeleteQuery, InsertQuery, Query, SelectQuery, UpdateQuery } from '../../connection/helpers';
import { envs } from 'src/config/envs';
import { GetMensajesDto } from '../dto/get-mensajes.dto';
import { EnviarMensajeDto } from '../dto/enviar-mensaje.dto';
import * as FormData from 'form-data';
import { WhatsappGateway } from '../whatsapp.gateway';
import { ListaChatDto } from './dto/lista-chat.dto';
import { SearchChatDto } from '../dto/search-chat.dto';
import { CacheConfig, MediaFile, WhatsAppConfig } from './interface/whatsapp';
import { isDefined } from 'src/util/helpers/common-util';

import { UploadMediaDto } from '../dto/upload-media.dto';
import { ChatFavoritoDto } from './dto/chat-favorito.dto';
import { ChatNoLeidoDto } from './dto/chat-no-leido.dto';
import { ListContactDto } from './dto/list-contact.dto';
import { ChatEtiquetaDto } from './dto/chat-etiqueta.dto';
import { GetChatsDto } from '../dto/get-chats.dto';
import { WhatsappDbService } from '../whatsapp-db.service';
import { getFileExtension } from '../web/helper/util';
import { FileTempService } from 'src/core/sistema/files/file-temp.service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Injectable()
export class WhatsappApiService {

    private WHATSAPP_API_URL: string;
    private readonly logger = new Logger(WhatsappApiService.name);

    constructor(private readonly httpService: HttpService,
        private readonly whatsappDb: WhatsappDbService,
        private readonly fileTempService: FileTempService,
        private readonly whatsappGateway: WhatsappGateway  // Inyectamos el gateway
    ) {
        // Recupera valores variables de entorno
        this.WHATSAPP_API_URL = envs.whatsappApiUrl;
    }


    //--------------------------------------API
    /**
    * Consume Api Whatsapp para enviar mensaje
    * @param data
    */
    async sendMessageWhatsApp(data: any, ideEmpr: number) {
        const config = await this.getConfigWhatsApp(ideEmpr);
        if (isDefined(config) === false && config.WHATSAPP_TYPE !== 'API')
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        try {

            const URL = `${this.WHATSAPP_API_URL}/${config.WHATSAPP_API_ID}/messages`;
            const requestConfig: AxiosRequestConfig = {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.WHATSAPP_API_TOKEN}`
                }
            };
            const resp = await this.httpService.axiosRef.post(URL, data, requestConfig);
            return resp.data;
        } catch (error) {
            console.error("❌ Error en sendMessageWhatsApp:", error.response?.data || error.message);
            throw new InternalServerErrorException(
                `[ERROR]: sendMessageWhatsApp ${JSON.stringify(error.response?.data || error.message)}`
            );
        }
    }



    /**
     * Sube un archivo a los servidores de WhatsApp
     * @param file 
     * @param ideEmpr 
     * @returns 
     */
    async sendMediaWhatsApp(file: Express.Multer.File, ideEmpr: number) {
        const config = await this.getConfigWhatsApp(ideEmpr);
        if (isDefined(config) === false && config.WHATSAPP_TYPE !== 'API')
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const URL = `${this.WHATSAPP_API_URL}/${config.WHATSAPP_API_ID}/media`;

        // control tipo de archivos permitidos
        let typeFile = file.mimetype;
        if (typeFile === "text/xml") {
            typeFile = "text/plain";
        }

        // Primero, subimos la imagen a los servidores de WhatsApp
        const formData = new FormData();
        formData.append("file", file.buffer, {
            filename: file.originalname,
            contentType: typeFile,
        });
        formData.append("messaging_product", "whatsapp");
        const requestConfig: AxiosRequestConfig = {
            headers: {
                Authorization: `Bearer ${config.WHATSAPP_API_TOKEN}`,
                ...formData.getHeaders(),
            }
        };
        try {
            const resp = await this.httpService.axiosRef.post(URL, formData, requestConfig);
            // console.log(resp.data);
            return resp.data.id; // Retorna el media_id
        } catch (error) {
            console.error("❌ Error en sendMediaWhatsApp:", error.response?.data || error.message);
            throw new InternalServerErrorException(
                `[ERROR]: sendMediaWhatsApp ${JSON.stringify(error.response?.data || error.message)}`
            );
        }
    }

    /**
     * Obtiene la URL y datos del archivo media
     * @param id 
     * @param ideEmpr 
     * @returns 
     */
    private async getMediaWhatsApp(id: string, ideEmpr: number) {
        const config = await this.getConfigWhatsApp(ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const URL = `${this.WHATSAPP_API_URL}/${id}`;

        const requestConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.WHATSAPP_API_TOKEN}`
            }
        };
        try {
            const resp = await this.httpService.axiosRef.get(URL, requestConfig);
            return resp.data;
        } catch (error) {
            console.error("❌ Error en getMediaWhatsApp:", error.response?.data || error.message);
            throw new InternalServerErrorException(
                `[ERROR]: getMediaWhatsApp ${JSON.stringify(error.response?.data || error.message)}`
            );
        }
    }


    /**
     * Descarga un archivo multimedia de WhatsApp y lo guarda temporalmente en el servidor
     * @param ideEmpr Identificador de empresa
     * @param id Identificador del mensaje/media
     * @returns Información del archivo descargado con URL temporal
     */
    async download(ideEmpr: string, id: string): Promise<MediaFile> {
        // 1. Verificar existencia del archivo en BD
        const resFile = await this.whatsappDb.getFile(id);
        if (!resFile) {
            throw new BadRequestException('El id no existe');
        }

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

        // 2. Obtener configuración de WhatsApp
        const config = await this.getConfigWhatsApp(Number(ideEmpr));
        if (!isDefined(config)) {
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        }

        // 3. Obtener URL del media desde WhatsApp
        const resUrl = await this.getMediaWhatsApp(id, Number(ideEmpr));
        const mediaUrl = resUrl.url;

        try {
            // 4. Descargar el archivo
            const fileData = await this.downloadFileFromUrl(
                mediaUrl,
                config.WHATSAPP_API_TOKEN
            );

            // 5. Guardar temporalmente y generar URL segura
            const fileExtension = getFileExtension(contentType, filename);
            const { fileName: tempFileName } = await this.fileTempService.saveTempFile(
                fileData,
                fileExtension
            );


            // 6. Actualizar la base de datos con la nueva información
            await this.whatsappDb.updateUrlFile(id, tempFileName);

            return {
                url: tempFileName,
                data: fileData,
                mimeType: contentType,
                fileSize: fileData.length,
                fileName: filename || tempFileName
            };

        } catch (error) {
            this.logger.error(`Error en downloadMedia_: ${error.message}`, error.stack);
            throw new InternalServerErrorException('Error al descargar el archivo multimedia');
        }
    }



    /**
     * Descarga un archivo desde una URL con autenticación
     */
    private async downloadFileFromUrl(url: string, authToken: string): Promise<Buffer> {
        const requestConfig: AxiosRequestConfig = {
            responseType: 'arraybuffer',
            headers: { Authorization: `Bearer ${authToken}` },
            maxContentLength: 100 * 1024 * 1024, // 100MB máximo
            timeout: 30000 // 30 segundos timeout
        };

        const response = await this.httpService.axiosRef.get(url, requestConfig);
        return Buffer.from(response.data, 'binary');
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
                        if (statuses.status === 'sent') {
                            updateQuery.values.set("timestamp_whmem", `${statuses.timestamp}`);
                        }
                        else if (statuses.status === 'delivered') {
                            updateQuery.values.set("timestamp_sent_whmem", new Date(Number(statuses.timestamp) * 1000).toISOString());
                        }
                        else if (statuses.status === 'read') {
                            updateQuery.values.set("timestamp_read_whmem", new Date(Number(statuses.timestamp) * 1000).toISOString());
                            updateQuery.values.set("leido_whmem", true);
                            this.whatsappGateway.sendReadMessageToClients(statuses.id);  // Emitir el mensaje recibido a los clientes WebSocket
                        }
                        else if (statuses.status === 'failed') {
                            updateQuery.values.set("timestamp_whmem", `${statuses.timestamp}`);
                            updateQuery.values.set("error_whmem", statuses?.errors[0].error_data.details);
                            updateQuery.values.set("code_error_whmem", `${statuses?.errors[0].code} - ${statuses?.errors[0].title}`);
                        }
                        updateQuery.where = 'id_whmem = $1';
                        updateQuery.addParam(1, statuses.id);
                        this.whatsappDb.dataSource.createQuery(updateQuery);
                    } catch (error) {
                        this.logger.error('Error al actualizar estado del mensaje', error);
                    }
                }
            }
            else {
                // guarda mensaje recibido
                const jsonMsg = JSON.stringify(body);
                try {
                    const query = new SelectQuery(`SELECT mensaje_whatsapp('${jsonMsg}'::jsonb) AS wa_id`);
                    const res = await this.whatsappDb.dataSource.createSingleQuery(query);
                    // Emitir el mensaje a través de WebSocket
                    this.whatsappGateway.sendMessageToClients(res.wa_id);  // Emitir el mensaje recibido a los clientes WebSocket                    

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
    async getMensajes(dto: GetMensajesDto & HeaderParamsDto) {
        if (dto.telefono === '000000000000') {
            return [];
        }
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        this.whatsappDb.setMensajesLeidosChat(dto, config);
        return await this.whatsappDb.getMensajes(dto, config);

    }

    /**
     * Retorna el array de las listas en las que se encuentra un contacto
     * @param dto 
     * @returns  [1,2]
     */
    async getListasContacto(dto: GetMensajesDto) {
        return await this.whatsappDb.getListasContacto(dto);
    }


    /**
     * Obtiene todos los mensajes agrupados por número de teléfono
     * @returns Lista de conversaciones agrupadas por número de teléfono
     */
    async getChats(dto: GetChatsDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        return await this.whatsappDb.getChats(dto, config);
    }

    /**
     * Busca un contacto por nombre o numero, retorna 25 coincidencias
     * @param dto 
     * @returns 
     */
    async searchContacto(dto: SearchChatDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        return await this.whatsappDb.searchContacto(dto, config);
    }


    /**
     * Retorna las listas de chats
     * @param dto 
     * @returns 
     */
    async getListas(dto: QueryOptionsDto  & HeaderParamsDto) {
        const data = await this.whatsappDb.getListas(dto);
        data.unshift(
            {
                "ide_whlis": -3,
                "nombre_whlis": "Favoritos",
                "color_whlis": null,
                "descripcion_whlis": null,
                "icono_whlis": 'uil:favorite',
                "total_chats": 0
            }
        );
        data.unshift(
            {
                "ide_whlis": -2,
                "nombre_whlis": "No leídos",
                "color_whlis": null,
                "descripcion_whlis": null,
                "icono_whlis": 'solar:chat-unread-outline',
                "total_chats": 0
            }
        );
        data.unshift(
            {
                "ide_whlis": -1,
                "nombre_whlis": "Todos",
                "color_whlis": null,
                "descripcion_whlis": null,
                "icono_whlis": 'mynaui:list-check-solid',
                "total_chats": 0
            }
        );
        return data;
    }


    async getEtiquetas(dto: QueryOptionsDto & HeaderParamsDto) {
        return await this.whatsappDb.getEtiquetas(dto);
    }

    /**
     * Retorna los Contactos agregados a una lista
     * @param dto 
     * @returns 
     */
    async getContactosLista(dto: ListaChatDto) {
        return await this.whatsappDb.getContactosLista(dto);
    }


    /**
     * Busca  contactos 
     * @param dto 
     * @returns 
     */
    async findContacto(dto: SearchChatDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        return await this.whatsappDb.findContacto(dto, config);
    }

    /**
     * Busca  texto en mensajes 
     * @param dto 
     * @returns 
     */
    async findTextoMensajes(dto: SearchChatDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        return await this.whatsappDb.findTextoMensajes(dto, config);
    }


    /**
     * 
     * @param dto 
     * @returns 
     */
    async getTotalMensajes(dto: QueryOptionsDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        return await this.whatsappDb.getTotalMensajes(dto, config);
    }



    async enviarMensajeTexto(dtoIn: EnviarMensajeDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(dtoIn.ideEmpr);
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
            const respWts = await this.sendMessageWhatsApp(data, dtoIn.ideEmpr);
            // Asigna el id del API para el mensaje
            dtoIn.idWts = respWts.messages[0].id;
            // Guarda el mensaje
            const resp = await this.whatsappDb.saveMensajeEnviado(dtoIn, config);
            return {
                mensaje: 'ok',
                data: resp,
                id: dtoIn.idWts
            };
        } catch (error) {
            throw new InternalServerErrorException(`[ERROR]: enviarMensaje ${error}`);
        }
    }


    async enviarMensajeMedia(dto: UploadMediaDto & HeaderParamsDto, file: Express.Multer.File) {
        const config = await this.getConfigWhatsApp(Number(dto.ideEmpr));
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');

        try {
            // Subir imagen y obtener media_id
            const mediaId = await this.sendMediaWhatsApp(file, Number(dto.ideEmpr));

            // console.log(file.mimetype);
            let data: any = undefined;
            // Crear el mensaje de imagen

            const dtoIn: EnviarMensajeDto = {
                telefono: dto.telefono,
                tipo: dto.type,
                texto: null,
                idWts: '',
                mediaId,
                // ideUsua: Number(dto.ideUsua),
                // ideEmpr: Number(dto.ideEmpr),
                // ideSucu: Number(dto.ideSucu),
                // idePerf: 1,
                // login: dto.login,
                fileName: dto.fileName,
                mimeType: file.mimetype
            }

            switch (dto.type) {
                case 'image':
                    data = {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: dto.telefono,
                        type: dto.type,
                        image: {
                            id: mediaId,
                            caption: dto.caption
                        },
                    };
                    break;
                case 'audio':
                    data = {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: dto.telefono,
                        type: dto.type,
                        audio: {
                            id: mediaId, // El ID de la imagen subida a WhatsApp
                            caption: dto.caption
                        }
                    };
                    break;
                case 'video':
                    data = {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: dto.telefono,
                        type: dto.type,
                        video: {
                            id: mediaId, // El ID de la imagen subida a WhatsApp
                            caption: dto.caption
                        }
                    };
                    break;
                default:
                    data = {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: dto.telefono,
                        type: 'document',
                        document: {
                            id: mediaId, // El ID de la imagen subida a WhatsApp
                            caption: dto.caption,
                            filename: dto.fileName
                        }
                    };
                    break;

                // Añadir más tipos de mensajes según sea necesario
            }

            // console.log(data);

            const respWts = await this.sendMessageWhatsApp(data, dto.ideEmpr);
            // Asigna el id del API para el mensaje
            dtoIn.idWts = respWts.messages[0].id;
            // Guarda el mensaje
            const resp = await this.whatsappDb.saveMensajeEnviado(dtoIn, config);
            return {
                mensaje: 'ok',
                data: respWts,
                resp

            };
        } catch (error) {
            console.log(error);
            throw new InternalServerErrorException(`[ERROR]: enviarMensajeMedia ${error}`);
        }
    }

    // ---------------------------------------

    /**
     * Envia mensaje de la plantilla activar mensajes
     * @param dtoIn 
     * @returns 
     */
    async activarNumero(dtoIn: MensajeChatDto & HeaderParamsDto) {
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
        const resp = await this.sendMessageWhatsApp(data, dtoIn.ideEmpr);
        return {
            mensaje: 'ok',
            data: resp
        }
    }



    /**
        * Marca como leidos todos los mensajes de un chat
        */
    async setMensajesLeidosChat(dto: GetMensajesDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(Number(dto.ideEmpr));
        return await this.whatsappDb.setMensajesLeidosChat(dto, config);

    }

    /**
    * Marca como no leido un chat
    */
    async setChatNoLeido(dto: ChatNoLeidoDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(Number(dto.ideEmpr));
        return await this.whatsappDb.setChatNoLeido(dto, config);
    }

    /**
     * Marca como favorito un chat
     * @param dto 
     * @returns 
     */
    async setChatFavorito(dto: ChatFavoritoDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(Number(dto.ideEmpr));
        return await this.whatsappDb.setChatFavorito(dto, config);

    }


    async setEtiquetaChat(dto: ChatEtiquetaDto & HeaderParamsDto) {
        const config = await this.getConfigWhatsApp(Number(dto.ideEmpr));
        return await this.whatsappDb.setEtiquetaChat(dto, config);

    }


    // -------------------------------- CACHE METHODS -------------------------------- //

    /**
     * Obtiene datos de la caché.
     * @param cacheKey - Clave de la caché.
     */
    private async getFromCache(cacheKey: string): Promise<WhatsAppConfig | null> {
        const dataConfig = await this.whatsappDb.dataSource.redisClient.get(cacheKey);
        return dataConfig ? JSON.parse(dataConfig) : null;
    }

    /**
     * Guarda datos en la caché.
     * @param cacheKey - Clave de la caché.
     * @param data - Datos a guardar.
     */
    private async setToCache(cacheKey: string, data: WhatsAppConfig): Promise<void> {
        await this.whatsappDb.dataSource.redisClient.set(cacheKey, JSON.stringify(data));
    }

    /**
     * Obtiene la configuración de WhatsApp desde la caché o la base de datos.
     * @param ideEmpr - ID de la empresa.
     */
    async getConfigWhatsApp(ideEmpr: number): Promise<CacheConfig | undefined> {
        const cacheKey = `whatsapp_config:${ideEmpr}`;
        let data = await this.getFromCache(cacheKey);
        if (!data) {
            data = await this.whatsappDb.fetchConfigFromDatabase(ideEmpr);
            if (data) {
                await this.setToCache(cacheKey, data);
            } else {
                return undefined;
            }
        }
        return {
            WHATSAPP_API_ID: data.id_cuenta_whcue,
            WHATSAPP_API_TOKEN: data.id_token_whcue,
            WHATSAPP_TYPE: data.tipo_whcue
        };
    }

    async saveListasContacto(dtoIn: ListContactDto & HeaderParamsDto) {
        const listQuery: Query[] = [];
        // borra todas las listas asignadas previamente
        const dq = new DeleteQuery("wha_lista_chat");
        dq.where = "wa_id_whlic = $1";
        dq.addParam(1, dtoIn.telefono);
        listQuery.push(dq);

        // inserta las listas del array 
        dtoIn.listas.forEach((list: number) => {
            const insertQuery = new InsertQuery('wha_lista_chat', 'ide_whlic',);
            insertQuery.values.set('ide_whlis', list);
            insertQuery.values.set('wa_id_whlic', dtoIn.telefono);
            insertQuery.values.set('usuario_ingre', dtoIn.login);
            listQuery.push(insertQuery);
        });
        // Ejecuta querys
        const messages = await this.whatsappDb.dataSource.createListQuery(listQuery);

        return {
            message: 'ok',
            rowCount: listQuery.length,
            resultMessage: messages,
        };

    }

}



// throw new Error('Error al obtener la configuración de WhatsApp');