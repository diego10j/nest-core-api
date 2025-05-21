import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { DataSourceService } from '../connection/datasource.service';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { InsertQuery, SelectQuery, UpdateQuery } from '../connection/helpers';
import { Message } from 'whatsapp-web.js';
import { fTimestampToISODate, getCurrentDateTime } from 'src/util/helpers/date-util';
import { WhatsappGateway } from './whatsapp.gateway';
import { getStatusMessage } from './web/helper/util';
import { CacheConfig, WhatsAppConfig } from './api/interface/whatsapp';
import { isDefined } from 'class-validator';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { GetChatsDto } from './dto/get-chats.dto';
import { SearchChatDto } from './dto/search-chat.dto';
import { ListaChatDto } from './api/dto/lista-chat.dto';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { ChatEtiquetaDto } from './api/dto/chat-etiqueta.dto';
import { ChatFavoritoDto } from './api/dto/chat-favorito.dto';
import { ChatNoLeidoDto } from './api/dto/chat-no-leido.dto';
import { GetDetalleCampaniaDto } from './dto/get-detalle-camp';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { EnviarCampaniaDto } from './dto/enviar-campania.dto';



@Injectable()
export class WhatsappDbService {


    private readonly logger = new Logger(WhatsappDbService.name);

    constructor(public readonly dataSource: DataSourceService,
        private readonly whatsappGateway: WhatsappGateway
    ) { }

    /**
        * Retorna la cuanta de whatsapp configurada para la empresa
        * @param dto 
        * @returns 
        */
    async getCuenta(ideEmpr: number) {
        const query = new SelectQuery(`       
        SELECT
            ide_whcue,
            nombre_whcue,
            id_telefono_whcue,
            id_aplicacion_whcue,
            enmascarar_texto (id_cuenta_whcue) AS id_cuenta_whcue,
            enmascarar_texto (id_token_whcue) AS id_token_whcue,
            tipo_whcue
        FROM
            wha_cuenta
        WHERE
            ide_empr = $1
            AND activo_whcue = TRUE
        LIMIT 1
        `);
        query.addParam(1, ideEmpr);
        const res = await this.dataSource.createSingleQuery(query);
        if (res) {
            return res;
        }
        throw new NotFoundException('No existe cuenta configurada');

    }


    /**
       * 
       * @param dto 
       * @returns 
       */
    async validarPermisoAgente(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
                SELECT 
                    COALESCE(SUM(a.no_leidos_whcha), 0) AS total_no_leidos,
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 
                            FROM sis_usuario ag
                            INNER JOIN wha_cuenta_agente cag ON ag.ide_usua = cag.ide_usua
                            INNER JOIN wha_cuenta cue ON cag.ide_whcue = cue.ide_whcue
                            WHERE ag.ide_usua = $1
                            AND cue.ide_empr = $2
                            AND activo_whcue = true
                            AND activo_whcuag = true
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

    /**
     * Obtine los agentes de la cuenta de whatsapp
     * @param dto 
     * @returns 
     */
    async getAgentesCuenta(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            select  ca.ide_whcuag, ca.ide_usua, 
                    nom_usua, ca.activo_whcuag,ca.hora_ingre, avatar_usua
            from wha_cuenta_agente ca
            inner join sis_usuario u on ca.ide_usua = u.ide_usua
            inner join wha_cuenta c on ca.ide_whcue = c.ide_whcue
            where c.ide_empr = $1
            and c.activo_whcue = true `, dto);
        query.addParam(1, dto.ideEmpr);
        return await this.dataSource.createQuery(query);
    }

    /**
    * Obtiene todos los mensajes agrupados por número de teléfono
    * @returns Lista de conversaciones agrupadas por número de teléfono
    */
    async getChats(dto: GetChatsDto, config: CacheConfig) {

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
        `);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }


    /**
       * 
       * @param dto 
       * @returns 
       */
    async getTotalMensajes(dto: QueryOptionsDto, config: CacheConfig) {
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
    * Busca  contactos 
    * @param dto 
    * @returns 
    */
    async findContacto(dto: SearchChatDto, config: CacheConfig) {
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
        `);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addStringParam(2, dto.texto);
        query.addStringParam(3, dto.texto);
        query.addStringParam(4, dto.texto);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }

    async getEtiquetas(dto: QueryOptionsDto & HeaderParamsDto) {
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
     * Retorna las listas de chats
     * @param dto 
     * @returns 
     */
    async getListas(dto: QueryOptionsDto & HeaderParamsDto) {
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
        return await this.dataSource.createSelectQuery(query);

    }

    /**
     * Retorna los mensajes de un chat 
     * @param dto 
     * @returns 
     */
    async getMensajes(dto: GetMensajesDto, config: CacheConfig) {
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
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
        `);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addParam(2, dto.telefono);
        return await this.dataSource.createSelectQuery(query);
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
        `);
        query.addParam(1, dto.telefono);
        const data = await this.dataSource.createSelectQuery(query);
        const result = data.map(item => item.ide_whlis);
        return result;
    }




    /**
       * Busca un contacto por nombre o numero, retorna 25 coincidencias
       * @param dto 
       * @returns 
    */
    async searchContacto(dto: SearchChatDto, config: CacheConfig) {
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
    `);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addStringParam(2, dto.texto);
        query.addStringParam(3, dto.texto);
        query.addStringParam(4, dto.texto);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

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
     * Busca  texto en mensajes 
     * @param dto 
     * @returns 
     */
    async findTextoMensajes(dto: SearchChatDto, config: CacheConfig) {


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
            `);
        query.addStringParam(1, config.WHATSAPP_API_ID);
        query.addStringParam(2, dto.texto);
        query.addStringParam(3, dto.texto);
        const data = await this.dataSource.createSelectQuery(query);
        return data;

    }

    /**
     * Obtener configuracion de whatasapp de una empresa
     * @param ideEmpr 
     * @returns 
     */
    async fetchConfigFromDatabase(ideEmpr: number): Promise<WhatsAppConfig | null> {
        const query = new SelectQuery(`
        SELECT
            id_cuenta_whcue,
            id_token_whcue,
            tipo_whcue
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
     * Retorna la info de un file 
     * @param id 
     * @returns 
     */
    async getFile(id: string) {
        // Busca datos del archivo
        const queryFile = new SelectQuery(`
            SELECT
                ide_whmem,
                attachment_type_whmem,
                attachment_name_whmem,
                attachment_url_whmem,
                attachment_size_whmem,
                content_type_whmem,
                phone_number_id_whmem
            FROM
                wha_mensaje 
            WHERE
                attachment_id_whmem = $1
        `);
        queryFile.addStringParam(1, id);
        return await this.dataSource.createSingleQuery(queryFile);
    }


    /**
     * Guarda un mensaje enviado en la base de datos.
     * @param dto - DTO con los datos del mensaje.
     */
    async saveMensajeEnviado(dto: EnviarMensajeDto, config: CacheConfig) {
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        try {
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
            insertQuery.values.set('leido_whmem', false);
            insertQuery.values.set('direction_whmem', 1);
            insertQuery.values.set('attachment_name_whmem', dto.fileName);
            insertQuery.values.set('attachment_type_whmem', dto.mimeType);
            insertQuery.values.set('tipo_whmem', 'API');

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

    /**
     * Actualiza la información del archivo en la base de datos
     */
    async updateUrlFile(id: string, url: string): Promise<void> {
        const updateQuery = new UpdateQuery('wha_mensaje', 'uuid');
        updateQuery.values.set('attachment_url_whmem', url);
        updateQuery.where = 'attachment_id_whmem = $1';
        updateQuery.addParam(1, id);
        await this.dataSource.createQuery(updateQuery);
    }



    /**
   * Marca como leidos todos los mensajes de un chat
   */
    async setMensajesLeidosChat(dto: GetMensajesDto, config: CacheConfig) {
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
    async setChatNoLeido(dto: ChatNoLeidoDto, config: CacheConfig) {
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
    async setChatFavorito(dto: ChatFavoritoDto, config: CacheConfig) {
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('favorito_whcha', dto.favorito);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, config.WHATSAPP_API_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery)

    }


    async setEtiquetaChat(dto: ChatEtiquetaDto, config: CacheConfig) {
        if (isDefined(config) === false)
            throw new BadRequestException('Error al obtener la configuración de WhatsApp');
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('ide_wheti', dto.etiqueta);
        updateQuery.where = 'phone_number_id_whcha = $1 and  wa_id_whcha = $2';
        updateQuery.addStringParam(1, config.WHATSAPP_API_ID);
        updateQuery.addParam(2, dto.telefono);
        return await this.dataSource.createQuery(updateQuery)

    }


    // =============================== WEB
    /**
      * Retorna la cuanta de whatsapp configurada para la empresa
      * @param dto 
      * @returns 
      */
    async getCuentaHabilitadas() {
        const query = new SelectQuery(`       
        SELECT
            ide_whcue,
            nombre_whcue,
            id_telefono_whcue,
            ide_empr
        FROM
            wha_cuenta
        WHERE activo_whcue = $1
            AND tipo_whcue = $2
        LIMIT 1
        `,);
        query.addParam(1, true);
        query.addParam(2, 'WEB');
        return await this.dataSource.createSelectQuery(query);
    }


    /**
       * Guarda un mensaje usando whatsapp web.
       * @param msg - datos del mensaje.
    */
    async saveMensajeEnviadoWeb(msg: Message, emitSocket: boolean, originalName: string = null) {
        try {
            const data = msg['_data'];

            const mediaInfo = msg.hasMedia ? {
                deprecatedMms3Url: data?.deprecatedMms3Url,
                mimetype: data?.mimetype,
                filename: originalName || data?.filename,
                size: data?.size,
                mediaKey: data?.mediaKey,
                // mediaKeyTimestamp: data?.mediaKeyTimestamp,
                width: data?.width,
                height: data?.height,
                isViewOnce: data?.isViewOnce,
                caption: data?.caption
            } : null;

            // Guarda mensaje
            const insertQuery = new InsertQuery('wha_mensaje', 'uuid')
            insertQuery.values.set('phone_number_id_whmem', data.from.user);
            insertQuery.values.set('phone_number_whmem', data.from.user);
            insertQuery.values.set('id_whmem', msg.id._serialized);
            insertQuery.values.set('wa_id_whmem', data.to.user);
            insertQuery.values.set('body_whmem', msg.body || '');
            insertQuery.values.set('fecha_whmem', getCurrentDateTime());
            insertQuery.values.set('timestamp_sent_whmem', fTimestampToISODate(msg.timestamp));
            insertQuery.values.set('timestamp_whmem', msg.timestamp);
            insertQuery.values.set('content_type_whmem', msg.type);
            insertQuery.values.set('leido_whmem', false);
            insertQuery.values.set('direction_whmem', 1);
            insertQuery.values.set('attachment_name_whmem', mediaInfo?.filename);
            insertQuery.values.set('attachment_type_whmem', mediaInfo?.mimetype);
            insertQuery.values.set('attachment_size_whmem', mediaInfo?.size);
            insertQuery.values.set('caption_whmem', mediaInfo?.caption);
            insertQuery.values.set('tipo_whmem', 'API');
            insertQuery.values.set('attachment_id_whmem', msg.id._serialized);
            insertQuery.values.set('tipo_whmem', 'WEB');
            insertQuery.values.set('status_whmem', getStatusMessage(data.ack));
            const res = await this.dataSource.createQuery(insertQuery);
            if (emitSocket) {
                this.whatsappGateway.sendMessageToClients(data.to.user);  // Emitir el mensaje enviado a los clientes WebSocket
            }
            return res;
        } catch (error) {
            this.logger.error(`Error saveMensajeEnviadoWeb: ${error.message}`);
            throw new InternalServerErrorException(`Error saveMensajeEnviadoWeb: ${error.message}`);
        }
    }




    // ================================= CAMPAÑAS

    /**
* Obtine los agentes de la cuenta de whatsapp
* @param dto 
* @returns 
*/
    async getListaCampanias(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT 
            cab.ide_whcenv, 
            cab.hora_ingre AS fecha, 
            cab.descripcion_whcenv, 
            CASE 
                WHEN LENGTH(cab.mensaje_whcenv) > 50 
                THEN CONCAT(LEFT(cab.mensaje_whcenv, 50), '...') 
                ELSE cab.mensaje_whcenv 
            END AS mensaje_whcenv,          
            nombre_whesce,
            cab.activo_whcenv, 
            t.nombre_whtice, 
            u.nom_usua,                         
            COUNT(det.ide_whdenv) AS total_detalle,
            SUM(CASE WHEN det.id_mensaje_whden IS NOT NULL THEN 1 ELSE 0 END) AS total_enviados_exito,
            cab.programado_whcenv, 
            cab.hora_progra_whcenv, 
            cab.ide_whesce,
            color_whesce
        FROM 
            wha_cab_camp_envio cab
        LEFT JOIN 
            wha_tipo_camp_envio t ON cab.ide_whtice = t.ide_whtice
        INNER JOIN 
        wha_estado_camp_envio e ON cab.ide_whesce = e.ide_whesce
        INNER JOIN 
            sis_usuario u ON cab.ide_usua = u.ide_usua
        INNER JOIN 
            wha_cuenta c ON cab.ide_whcue = c.ide_whcue
        LEFT JOIN 
            wha_det_camp_envio det ON cab.ide_whcenv = det.ide_whcenv
        WHERE 
            c.ide_empr = $1
            AND c.activo_whcue = TRUE
        GROUP BY 
            cab.ide_whcenv, 
            cab.hora_ingre,
            cab.descripcion_whcenv, 
            cab.mensaje_whcenv,  
            cab.programado_whcenv, 
            cab.hora_progra_whcenv, 
            cab.ide_whesce, 
            nombre_whesce,
            c.activo_whcue, 
            t.nombre_whtice, 
            color_whesce, 
            u.nom_usua`, dto);
        query.addParam(1, dto.ideEmpr);
        return await this.dataSource.createQuery(query);
    }


    async getDetalleCampania(dto: GetDetalleCampaniaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            ide_whdenv,
            telefono_whden,
            observacion_whden,
            d.hora_ingre AS fecha_creacion,
            fecha_envio_whden,
            id_mensaje_whden,
            timestamp_sent_whmem,
            error_whmem
        FROM
            wha_det_camp_envio d
            LEFT JOIN wha_mensaje m ON d.id_mensaje_whden = m.id_whmem
        WHERE
            ide_whcenv = $1
        ORDER BY
            d.hora_ingre`, dto);
        query.addParam(1, dto.ide_whcenv);
        return await this.dataSource.createQuery(query);
    }


    async getCampaniaEnvio(dto: EnviarCampaniaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            ide_whdenv,
            telefono_whden,
            ide_whesce,
            mensaje_whcenv,
            media_whcenv
        FROM
            wha_det_camp_envio d
            LEFT JOIN wha_cab_camp_envio c on d.ide_whcenv = c.ide_whcenv            
        WHERE
            c.ide_whcenv = $1
        AND id_mensaje_whden is NULL
        AND tiene_whats_whden = true
        ORDER BY d.hora_ingre
    `);
        query.addParam(1, dto.ide_whcenv);
        return await this.dataSource.createSelectQuery(query);
    }
}


