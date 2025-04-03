import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { ServiceDto } from 'src/common/dto/service.dto';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { DeleteQuery, InsertQuery, Query, SelectQuery, UpdateQuery } from '../connection/helpers';
import { getCurrentDateTime } from '../../util/helpers/date-util';
import { envs } from 'src/config/envs';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import * as FormData from 'form-data';
import { WhatsappGateway } from './whatsapp.gateway';
import { ListaChatDto } from './dto/lista-chat.dto';
import { FindChatDto } from './dto/find-chat.dto';
import { CacheConfig, WhatsAppConfig } from './interfaces/whatsapp';
import { isDefined } from 'src/util/helpers/common-util';
import { GetUrlArchivoDto } from './dto/get-url-media.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { ChatFavoritoDto } from './dto/chat-favorito.dto';
import { ChatNoLeidoDto } from './dto/chat-no-leido.dto';
import { ListContactDto } from './dto/list-contact.dto';
import { ChatEtiquetaDto } from './dto/chat-etiqueta.dto';

@Injectable()
export class WhatsappService {

    private WHATSAPP_API_URL: string;
    private readonly logger = new Logger(WhatsappService.name);

    constructor(private readonly httpService: HttpService,
        private readonly dataSource: DataSourceService,
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
        if (isDefined(config) === false)
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
    * Retorna datos de perfil asociados al ID utilizado
    */
    async getProfile(dto: ServiceDto) {
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const URL = `${this.WHATSAPP_API_URL}/${config.WHATSAPP_API_ID}`;

        const requestConfig: AxiosRequestConfig = {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.WHATSAPP_API_TOKEN}`
            }
        };

        try {
            const resp = await this.httpService.axiosRef.get(URL, requestConfig);
            return {
                nombre: resp.data.verified_name,
                telefono: resp.data.display_phone_number,
            }
        } catch (error) {
            console.error("❌ Error en getWhatsAppProfile:", error.response?.data || error.message);
            throw new InternalServerErrorException(
                `[ERROR]: getWhatsAppProfile ${JSON.stringify(error.response?.data || error.message)}`
            );
        }
    }

    /**
     * Sube un archivo a los servidores de WhatsApp
     * @param file 
     * @param ideEmpr 
     * @returns 
     */
    private async sendMediaWhatsApp(file: Express.Multer.File, ideEmpr: number) {
        const config = await this.getConfigWhatsApp(ideEmpr);
        if (isDefined(config) === false)
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
     * Permite descargar un archivo del API de whatsaap 
     * @param id 
     * @returns 
     */
    async download(id: string) {
        // Busca datos del archivo
        const queryFile = new SelectQuery(`
            SELECT
                ide_whmem,
                attachment_type_whmem,
                attachment_name_whmem,
                attachment_url_whmem,
                attachment_size_whmem,
                content_type_whmem,
                phone_number_id_whmem,
                b.ide_empr
            FROM
                wha_mensaje a
            INNER JOIN
                wha_cuenta b ON b.id_cuenta_whcue = a.phone_number_id_whmem
            WHERE
                a.attachment_id_whmem = $1
        `);
        queryFile.addStringParam(1, id);
        const resFile = await this.dataSource.createSingleQuery(queryFile);

        if (!resFile) {
            throw new BadRequestException('El id no existe');
        }
        const {
            ide_empr,
            attachment_name_whmem: fileName,
            attachment_size_whmem: sizeFile,
            attachment_type_whmem: contentType
        } = resFile;

        // Obtener la configuración de WhatsApp
        const config = await this.getConfigWhatsApp(Number(ide_empr));
        if (!isDefined(config)) {
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        }

        const resUrl = await this.getMediaWhatsApp(id, Number(ide_empr));
        //  console.log(resUrl)
        const URL = resUrl.url;

        // Si no hay URL, obtenerla desde la API de WhatsApp
        if (!sizeFile) {
            // Actualizar la URL y el tamaño en la base de datos
            const updateQuery = new UpdateQuery('wha_mensaje', 'uuid');
            updateQuery.values.set('attachment_size_whmem', resUrl.file_size);
            updateQuery.where = 'attachment_id_whmem = $1';
            updateQuery.addParam(1, id);
            await this.dataSource.createQuery(updateQuery); // Usar await para asegurar que se complete la actualización
        }

        // Configuración de la solicitud HTTP
        const requestConfig: AxiosRequestConfig = {
            responseType: 'arraybuffer', // Importante para manejar binarios
            headers: {
                Authorization: `Bearer ${config.WHATSAPP_API_TOKEN}`,
            },
        };

        try {
            // console.log(URL);
            const resp = await this.httpService.axiosRef.get(URL, requestConfig);
            // console.log(resp);
            return {
                data: resp.data, // Datos binarios del archivo
                contentType, //: resp.headers['content-type'], // Tipo MIME del archivo
                fileSize: resp.headers['content-length'], // Tamaño del archivo
                fileName
            };
        } catch (error) {
            console.error('❌ Error en download:', error.response?.data || error.message);
            throw new InternalServerErrorException(
                `[ERROR]: download ${JSON.stringify(error.response?.data || error.message)}`,
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
                    const query = new SelectQuery(`SELECT mensaje_whatsapp('${jsonMsg}'::jsonb) AS wa_id`);
                    const res = await this.dataSource.createSingleQuery(query);
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
    async getMensajes(dto: GetMensajesDto) {
        if (dto.telefono === '000000000000') {
            return [];
        }
        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');

        this.setMensajesLeidosChat(dto);

        const query = new SelectQuery(`
            select
                *
            from
                wha_mensaje
            WHERE
                phone_number_id_whmem = $1
            and wa_id_whmem = $2
            order by
                ide_whmem     
        `, dto);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addParam(2, dto.telefono);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }

    /**
     * Retorna el array de las listas en las que se encuentra un contacto
     * @param dto 
     * @returns  [1,2]
     */
    async getListasContacto(dto: GetMensajesDto) {
        if (dto.telefono === '000000000000') {
            return [];
        }
        const query = new SelectQuery(`
        SELECT
            a.ide_whlis
        FROM
            wha_lista_chat a
            inner join wha_lista b on a.ide_whlis = b.ide_whlis
        WHERE
            a.wa_id_whlic = $1
            AND activo_whlis = TRUE
        `, dto);
        query.addParam(1, dto.telefono);
        const data = await this.dataSource.createSelectQuery(query);
        const result = data.map(item => item.ide_whlis);
        return result;
    }


    /**
     * Retorna la cuanta de whatsapp configurada para la empresa
     * @param dto 
     * @returns 
     */
    async getCuenta(dto: ServiceDto) {
        const query = new SelectQuery(`       
        SELECT
            ide_whcue,
            nombre_whcue,
            id_telefono_whcue,
            id_aplicacion_whcue,
            enmascarar_texto (id_cuenta_whcue) AS id_cuenta_whcue,
            enmascarar_texto (id_token_whcue) AS id_token_whcue
        FROM
            wha_cuenta
        WHERE
            ide_empr = $1
            AND activo_whcue = TRUE
        LIMIT 1
        `, dto);
        query.addParam(1, dto.ideEmpr);
        return await this.dataSource.createSingleQuery(query);

    }


    /**
     * Retorna url y datos de un archivo 
     * @param dto 
     * @returns 
     */
    async getUrlArchivo(dto: GetUrlArchivoDto) {
        if (dto.id === '000000000000') {
            return {};
        }

        return await this.getMediaWhatsApp(dto.id, dto.ideEmpr);
    }

    /**
     * Obtiene todos los mensajes agrupados por número de teléfono
     * @returns Lista de conversaciones agrupadas por número de teléfono
     */
    async getChats(dto: ServiceDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');

        const query = new SelectQuery(`
        SELECT
            a.ide_whcha,
            fecha_crea_whcha,
            fecha_msg_whcha,
            name_whcha,
            nombre_whcha,
            phone_number_whcha,
            leido_whcha,
            favorito_whcha,
            wa_id_whmem,
            id_whmem,
            wa_id_context_whmem,
            body_whmem,
            fecha_whmem,
            content_type_whmem,
            status_whmem,
            direction_whmem,
            no_leidos_whcha,
            nombre_wheti,
            color_wheti,
            a.ide_wheti
        FROM
            wha_chat a
            left join wha_mensaje b on a.id_whcha = b.id_whmem
            left join wha_etiqueta c on a.ide_wheti = c.ide_wheti
        WHERE phone_number_id_whcha = $1
        order by
            fecha_msg_whcha desc
        `, dto);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }

    /**
     * Busca un contacto por nombre o numero, retorna 25 coincidencias
     * @param dto 
     * @returns 
     */
    async searchContacto(dto: FindChatDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');

        if (dto.texto.trim() === '') {
            return [];
        }

        const query = new SelectQuery(`
        SELECT
            a.ide_whcha,
            fecha_crea_whcha,
            fecha_msg_whcha,
            name_whcha,
            nombre_whcha,
            phone_number_whcha,
            leido_whcha,
            favorito_whcha,
            wa_id_whmem,
            id_whmem,
            wa_id_context_whmem,
            body_whmem,
            fecha_whmem,
            content_type_whmem,
            status_whmem,
            direction_whmem,
            no_leidos_whcha,
            nombre_wheti,
            color_wheti,
            a.ide_wheti
        FROM
            wha_chat a
            left join wha_mensaje b on a.id_whcha = b.id_whmem
            left join wha_etiqueta c on a.ide_wheti = c.ide_wheti
        WHERE phone_number_id_whcha = $1
        AND (
            unaccent(LOWER(a.name_whcha)) ILIKE '%' || unaccent(LOWER($2)) || '%'
            OR unaccent(LOWER(a.nombre_whcha)) ILIKE '%' || unaccent(LOWER($3)) || '%'
            OR unaccent(LOWER(f_phone_number(a.wa_id_whcha))) ILIKE '%' || unaccent(LOWER($4)) || '%'
        )
        order by nombre_whcha 
        LIMIT ${dto.resultados}            
        `, dto);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addStringParam(2, dto.texto);
        query.addStringParam(3, dto.texto);
        query.addStringParam(4, dto.texto);
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
            and activo_whlis = true            
        GROUP BY
            a.ide_whlis, a.nombre_whlis, a.color_whlis, a.descripcion_whlis, a.icono_whlis
        ORDER BY a.nombre_whlis
        `, dto);
        query.addParam(1, dto.ideEmpr);
        const data = await this.dataSource.createSelectQuery(query);

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


    async getEtiquetas(dto: ServiceDto) {
        const query = new SelectQuery(`
        SELECT
            a.ide_wheti,
            a.nombre_wheti,
            a.color_wheti,
            a.descripcion_wheti
        FROM
            wha_etiqueta a
        WHERE
            a.ide_empr = $1
            AND activo_wheti = TRUE
        ORDER BY
            a.nombre_wheti
        `, dto);
        query.addParam(1, dto.ideEmpr);
        return await this.dataSource.createSelectQuery(query);
    }



    /**
     * Retorna los Contactos agregados a una lista
     * @param dto 
     * @returns 
     */
    async getContactosLista(dto: ListaChatDto) {
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


    /**
     * Busca  contactos 
     * @param dto 
     * @returns 
     */
    async findContacto(dto: FindChatDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const query = new SelectQuery(`
        SELECT
            a.ide_whcha,
            a.fecha_crea_whcha,
            a.fecha_msg_whcha,
            a.name_whcha,
            a.nombre_whcha,
            a.phone_number_whcha,
            a.leido_whcha,
            a.favorito_whcha,
            a.no_leidos_whcha
        FROM
            wha_chat a
        WHERE
            a.phone_number_id_whcha = $1
            AND (
                unaccent(LOWER(a.name_whcha)) ILIKE '%' || unaccent(LOWER($2)) || '%'
                OR unaccent(LOWER(a.nombre_whcha)) ILIKE '%' || unaccent(LOWER($3)) || '%'
                OR unaccent(LOWER(a.wa_id_whcha)) ILIKE '%' || unaccent(LOWER($4)) || '%'
            )
        order by
            a.fecha_msg_whcha DESC
        LIMIT ${dto.resultados}
        `, dto);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addStringParam(2, dto.texto);
        query.addStringParam(3, dto.texto);
        query.addStringParam(4, dto.texto);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }

    /**
     * Busca  texto en mensajes 
     * @param dto 
     * @returns 
     */
    async findTextoMensajes(dto: FindChatDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const query = new SelectQuery(`
        SELECT
            a.ide_whcha,
            a.fecha_crea_whcha,
            a.fecha_msg_whcha,
            a.name_whcha,
            a.nombre_whcha,
            a.phone_number_whcha,
            a.leido_whcha,
            a.favorito_whcha,
            a.no_leidos_whcha,
            b.body_whmem,
            b.caption_whmem
        FROM
            wha_mensaje b
            inner JOIN wha_chat a ON b.wa_id_whmem = a.wa_id_whcha
        WHERE
            a.phone_number_id_whcha = $1
            AND (
                unaccent(LOWER(b.body_whmem)) ILIKE '%' || unaccent(LOWER($2)) || '%'
                OR unaccent(LOWER(b.caption_whmem)) ILIKE '%' || unaccent(LOWER($3)) || '%'
            )
        order by
            a.fecha_msg_whcha DESC
        LIMIT ${dto.resultados}
        `, dto);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addStringParam(2, dto.texto);
        query.addStringParam(3, dto.texto);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }


    /**
     * 
     * @param dto 
     * @returns 
     */
    async getTotalMensajes(dto: ServiceDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const query = new SelectQuery(`
        SELECT 
        (SELECT count(1) 
         FROM wha_mensaje 
         WHERE direction_whmem = '0' 
           AND phone_number_id_whmem = $1) AS msg_enviados,
        
        (SELECT count(1) 
         FROM wha_mensaje 
         WHERE direction_whmem = '1' 
           AND phone_number_id_whmem = $2) AS msg_recibidos,
        
        (SELECT count(1) 
         FROM wha_chat 
         WHERE phone_number_id_whcha = $3) AS total_chats,
        
        (SELECT count(1) 
         FROM wha_chat 
         WHERE leido_whcha = FALSE 
           AND phone_number_id_whcha = $4) AS total_chats_no_leidos    
        `, dto);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addStringParam(2, config.WHATSAPP_API_ID);
        query.addStringParam(3, config.WHATSAPP_API_ID);
        query.addStringParam(4, config.WHATSAPP_API_ID);

        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }



    /**
     * 
     * @param dto 
     * @returns 
     */
    async validarPermisoAgente(dto: ServiceDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');

        const query = new SelectQuery(`
            SELECT 
                COALESCE(SUM(a.no_leidos_whcha), 0) AS total_no_leidos,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 
                        FROM wha_agente ag
                        INNER JOIN wha_cuenta_agente cag ON ag.ide_whage = cag.ide_whage
                        INNER JOIN wha_cuenta cue ON cag.ide_whcue = cue.ide_whcue
                        WHERE ag.ide_usua = $1
                        AND cue.ide_empr = $2
                        AND activo_whcue = true
                        AND ag.activo_whage = TRUE
                        limit 1
                    ) THEN 'si'
                    ELSE 'no'
                END AS permso_whatsapp
            FROM 
                wha_chat a
            WHERE 
                a.phone_number_id_whcha = (SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $3 and activo_whcue = true limit 1);  
            `, dto);
        query.addParam(1, dto.ideUsua);
        query.addParam(2, dto.ideEmpr);
        query.addParam(3, dto.ideEmpr);


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
            const respWts = await this.sendMessageWhatsApp(data, dtoIn.ideEmpr);
            // Asigna el id del API para el mensaje
            dtoIn.idWts = respWts.messages[0].id;
            // Guarda el mensaje
            const resp = await this.saveMensajeEnviado(dtoIn);
            return {
                mensaje: 'ok',
                data: resp,
                id: dtoIn.idWts
            };
        } catch (error) {
            throw new InternalServerErrorException(`[ERROR]: enviarMensaje ${error}`);
        }
    }


    async enviarMensajeMedia(dto: UploadMediaDto, file: Express.Multer.File) {
        try {
            // Subir imagen y obtener media_id
            const mediaId = await this.sendMediaWhatsApp(file, Number(dto.ideEmpr));

            // console.log(file.mimetype);
            let data: any = undefined;
            // Crear el mensaje de imagen

            const dtoIn: EnviarMensajeDto = {
                telefono: dto.telefono,
                tipo: dto.fileType,
                idWts: '',
                mediaId,
                ideUsua: Number(dto.ideUsua),
                ideEmpr: Number(dto.ideEmpr),
                ideSucu: Number(dto.ideSucu),
                idePerf: 1,
                login: dto.login,
                fileName: dto.fileName,
                mimeType: file.mimetype
            }

            switch (dto.fileType) {
                case 'image':
                    data = {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: dto.telefono,
                        type: dto.fileType,
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
                        type: dto.fileType,
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
                        type: dto.fileType,
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

            const respWts = await this.sendMessageWhatsApp(data, dtoIn.ideEmpr);
            // Asigna el id del API para el mensaje
            dtoIn.idWts = respWts.messages[0].id;
            // Guarda el mensaje
            const resp = await this.saveMensajeEnviado(dtoIn);
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

    /**
     * Marca como leidos todos los mensajes de un chat
     */
    async setMensajesLeidosChat(dto: GetMensajesDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');

        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('no_leidos_whcha', 0);
        updateQuery.values.set('leido_whcha', true);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, config.WHATSAPP_API_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery);

    }

    /**
    * Marca como no leido un chat
    */
    async setChatNoLeido(dto: ChatNoLeidoDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('leido_whcha', dto.leido);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, config.WHATSAPP_API_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery)

    }

    /**
     * Marca como favorito un chat
     * @param dto 
     * @returns 
     */
    async setChatFavorito(dto: ChatFavoritoDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('favorito_whcha', dto.favorito);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, config.WHATSAPP_API_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery)

    }


    async setEtiquetaChat(dto: ChatEtiquetaDto) {

        const config = await this.getConfigWhatsApp(dto.ideEmpr);
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('ide_wheti', dto.etiqueta);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, config.WHATSAPP_API_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery)

    }



    // ---------------------------------------

    /**
     * Guarda un mensaje enviado en la base de datos.
     * @param dto - DTO con los datos del mensaje.
     */
    private async saveMensajeEnviado(dto: EnviarMensajeDto) {
        try {
            const config = await this.getConfigWhatsApp(dto.ideEmpr);
            if (isDefined(config) === false)
                throw new BadRequestException('Error al obtener la configuración de WhatsApp');
            // Actualiza último mensaje chat
            const updateQuery = new UpdateQuery('wha_chat', 'ide_whcha');
            updateQuery.values.set("id_whcha", dto.idWts);
            updateQuery.where = 'wa_id_whcha = $1';
            updateQuery.addParam(1, dto.telefono);
            await this.dataSource.createQuery(updateQuery);
            // Guarda mensaje
            const insertQuery = new InsertQuery('wha_mensaje', 'uuid')
            insertQuery.values.set('phone_number_id_whmem', config.WHATSAPP_API_ID);
            insertQuery.values.set('wa_id_whmem', dto.telefono);
            insertQuery.values.set('id_whmem', dto.idWts);
            insertQuery.values.set('body_whmem', dto.texto || '');
            insertQuery.values.set('fecha_whmem', getCurrentDateTime());
            insertQuery.values.set('content_type_whmem', dto.tipo);
            insertQuery.values.set('leido_whmem', true);
            insertQuery.values.set('direction_whmem', 1);
            insertQuery.values.set('attachment_name_whmem', dto.fileName);
            insertQuery.values.set('attachment_type_whmem', dto.mimeType);

            //media
            insertQuery.values.set('attachment_id_whmem', dto.mediaId);
            const res = await this.dataSource.createQuery(insertQuery);
            this.whatsappGateway.sendMessageToClients(dto.telefono);  // Emitir el mensaje enviado a los clientes WebSocket
            return res;
        } catch (error) {
            this.logger.error(`Error saveMensajeEnviado: ${error.message}`);
            throw new InternalServerErrorException(`Error saveMensajeEnviado: ${error.message}`);
        }
    }

    private async fetchConfigFromDatabase(ideEmpr: number): Promise<WhatsAppConfig | null> {
        const query = new SelectQuery(`
        SELECT
            id_cuenta_whcue,
            id_token_whcue
        FROM
            wha_cuenta
        WHERE
            ide_empr = $1
            AND activo_whcue = TRUE
        LIMIT 1        
        `);
        query.addParam(1, ideEmpr);
        return await this.dataSource.createSingleQuery(query);
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
        const resp = await this.sendMessageWhatsApp(data, dtoIn.ideEmpr);
        return {
            mensaje: 'ok',
            data: resp
        }
    }




    // -------------------------------- CACHE METHODS -------------------------------- //

    /**
     * Obtiene datos de la caché.
     * @param cacheKey - Clave de la caché.
     */
    private async getFromCache(cacheKey: string): Promise<WhatsAppConfig | null> {
        const dataConfig = await this.dataSource.redisClient.get(cacheKey);
        return dataConfig ? JSON.parse(dataConfig) : null;
    }

    /**
     * Guarda datos en la caché.
     * @param cacheKey - Clave de la caché.
     * @param data - Datos a guardar.
     */
    private async setToCache(cacheKey: string, data: WhatsAppConfig): Promise<void> {
        await this.dataSource.redisClient.set(cacheKey, JSON.stringify(data));
    }

    /**
     * Obtiene la configuración de WhatsApp desde la caché o la base de datos.
     * @param ideEmpr - ID de la empresa.
     */
    async getConfigWhatsApp(ideEmpr: number): Promise<CacheConfig | undefined> {
        const cacheKey = `whatsapp_config_${ideEmpr}`;
        let data = await this.getFromCache(cacheKey);
        if (!data) {
            data = await this.fetchConfigFromDatabase(ideEmpr);
            if (data) {
                await this.setToCache(cacheKey, data);
            } else {
                return undefined;
            }
        }
        return {
            WHATSAPP_API_ID: data.id_cuenta_whcue,
            WHATSAPP_API_TOKEN: data.id_token_whcue,
        };
    }

    async saveListasContacto(dtoIn: ListContactDto) {
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
        const messages = await this.dataSource.createListQuery(listQuery);

        return {
            message: 'ok',
            rowCount: listQuery.length,
            resultMessage: messages,
        };

    }


}



// throw new Error('Error al obtener la configuración de WhatsApp');