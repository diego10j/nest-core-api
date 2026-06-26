import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { DataSourceService } from '../connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from '../connection/helpers';

import { ChatEtiquetaDto } from './api/dto/chat-etiqueta.dto';
import { ChatFavoritoDto } from './api/dto/chat-favorito.dto';
import { ChatNoLeidoDto } from './api/dto/chat-no-leido.dto';
import { ListaChatDto } from './api/dto/lista-chat.dto';
import { WhatsAppConfig } from './api/interface/whatsapp';
import { EnviarCampaniaDto } from './dto/enviar-campania.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { GetChatsDto } from './dto/get-chats.dto';
import { GetDetalleCampaniaDto } from './dto/get-detalle-camp';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { SearchChatDto } from './dto/search-chat.dto';
import { TelefonoDto } from './dto/telefono.dto';
import { WhatsappGateway } from './whatsapp.gateway';

@Injectable()
export class WhatsappDbService {
    private readonly logger = new Logger(WhatsappDbService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly whatsappGateway: WhatsappGateway,
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
            f_enmascarar_texto (id_cuenta_whcue) AS id_cuenta_whcue,
            f_enmascarar_texto (id_token_whcue) AS id_token_whcue,
            tipo_whcue
        FROM
            wha_cuenta
        WHERE
            ide_empr = $1
            AND activo_whcue = TRUE
        LIMIT 1
        `);
        query.addParam(1, ideEmpr);
        return this.dataSource.createSingleQuery(query);
        // if (res) {
        //   return res;
        // }
        // throw new NotFoundException('No existe cuenta configurada');
    }

    /**
     *
     * @param dto
     * @returns
     */
    async validarPermisoAgente(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
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
                `,
            dto,
        );
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
        const query = new SelectQuery(
            `
            select  ca.ide_whcuag, ca.ide_usua, 
                    nom_usua, ca.activo_whcuag,ca.hora_ingre, avatar_usua
            from wha_cuenta_agente ca
            inner join sis_usuario u on ca.ide_usua = u.ide_usua
            inner join wha_cuenta c on ca.ide_whcue = c.ide_whcue
            where c.ide_empr = $1
            and c.activo_whcue = true `,
            dto,
        );
        query.addParam(1, dto.ideEmpr);
        return await this.dataSource.createQuery(query);
    }

    /**
     * Obtiene todos los mensajes agrupados por número de teléfono
     * @returns Lista de conversaciones agrupadas por número de teléfono
     */
    async getChats(dto: GetChatsDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            a.ide_whcha,
            a.wa_id_whcha,
            fecha_crea_whcha,
            fecha_msg_whcha,
            name_whcha,
            nombre_whcha,
            phone_number_whcha,
            leido_whcha,
            favorito_whcha,
            -- Último mensaje
            m.body_whmem,
            m.caption_whmem,
            m.fecha_whmem,
            m.content_type_whmem,
            m.direction_whmem,
            m.es_bot_whmem,
            -- Sin leer
            no_leidos_whcha,
            -- Etiqueta
            c.nombre_wheti,
            c.color_wheti,
            a.ide_wheti,
            -- Bot y agente
            a.bot_activo_whcha,
            a.bot_modo_whcha,
            a.ide_usua_asignado_whcha,
            u.nom_usua             AS nombre_agente_asignado,
            -- Ventana 24h
            EXTRACT(EPOCH FROM (NOW() - a.ultimo_ingreso_cliente_whcha))::INT AS segundos_desde_cliente,
            CASE
              WHEN a.ultimo_ingreso_cliente_whcha IS NULL THEN FALSE
              WHEN EXTRACT(EPOCH FROM (NOW() - a.ultimo_ingreso_cliente_whcha)) <= 86400 THEN TRUE
              ELSE FALSE
            END AS ventana_activa
        FROM wha_chat a
        INNER JOIN wha_cuenta cu ON cu.ide_empr = $1 AND cu.activo_whcue = TRUE
                   AND cu.id_cuenta_whcue = a.phone_number_id_whcha
        LEFT JOIN LATERAL (
            SELECT body_whmem, caption_whmem, content_type_whmem,
                   direction_whmem, es_bot_whmem, fecha_whmem
            FROM wha_mensaje
            WHERE phone_number_id_whmem = a.phone_number_id_whcha
              AND wa_id_whmem = a.wa_id_whcha
            ORDER BY fecha_whmem DESC
            LIMIT 1
        ) m ON TRUE
        LEFT JOIN wha_etiqueta c ON a.ide_wheti = c.ide_wheti
        LEFT JOIN sis_usuario u ON a.ide_usua_asignado_whcha = u.ide_usua
        WHERE a.eliminado_whcha = FALSE
        ORDER BY a.fecha_msg_whcha DESC NULLS LAST
        `);
        query.addIntParam(1, dto.ideEmpr);
        const data = await this.dataSource.createSelectQuery(query);
        return data;
    }

    /**
     *
     * @param dto
     * @returns
     */
    async getTotalMensajes(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
    WITH cuenta AS (
        SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $1 AND activo_whcue = TRUE LIMIT 1
    )
    SELECT
    (SELECT count(1) FROM wha_mensaje WHERE direction_whmem = '0' AND phone_number_id_whmem = (SELECT id_cuenta_whcue FROM cuenta)) AS msg_enviados,
    (SELECT count(1) FROM wha_mensaje WHERE direction_whmem = '1' AND phone_number_id_whmem = (SELECT id_cuenta_whcue FROM cuenta)) AS msg_recibidos,
    (SELECT count(1) FROM wha_chat        WHERE phone_number_id_whcha = (SELECT id_cuenta_whcue FROM cuenta))                        AS total_chats,
    (SELECT count(1) FROM wha_chat        WHERE leido_whcha = FALSE   AND phone_number_id_whcha = (SELECT id_cuenta_whcue FROM cuenta)) AS total_chats_no_leidos
    `,
            dto,
        );
        query.addIntParam(1, dto.ideEmpr);
        const data = await this.dataSource.createSelectQuery(query);
        return data;
    }

    /**
     * Busca  contactos
     * @param dto
     * @returns
     */
    async findContacto(dto: SearchChatDto & HeaderParamsDto) {
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
        FROM wha_chat a
        INNER JOIN wha_cuenta cu ON cu.ide_empr = $1 AND cu.activo_whcue = TRUE
                   AND cu.id_cuenta_whcue = a.phone_number_id_whcha
        WHERE (
            unaccent(LOWER(a.name_whcha))   ILIKE '%' || unaccent(LOWER($2)) || '%'
            OR unaccent(LOWER(a.nombre_whcha)) ILIKE '%' || unaccent(LOWER($3)) || '%'
            OR unaccent(LOWER(a.wa_id_whcha))  ILIKE '%' || unaccent(LOWER($4)) || '%'
        )
        ORDER BY a.fecha_msg_whcha DESC
        LIMIT ${dto.resultados}
        `);
        query.addIntParam(1, dto.ideEmpr);
        query.addStringParam(2, dto.texto);
        query.addStringParam(3, dto.texto);
        query.addStringParam(4, dto.texto);
        const data = await this.dataSource.createSelectQuery(query);
        return data;
    }

    async getEtiquetas(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
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
        `,
            dto,
        );
        query.addParam(1, dto.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna las listas de chats
     * @param dto
     * @returns
     */
    async getListas(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
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
            `,
            dto,
        );
        query.addParam(1, dto.ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los mensajes de un chat
     * @param dto
     * @returns
     */
    async getMensajes(dto: GetMensajesDto) {
        const query = new SelectQuery(`
            SELECT
                m.*,
                m.es_bot_whmem,
                u.nom_usua    AS nombre_agente,
                u.avatar_usua AS avatar_agente,
                -- Mensaje citado (cuando este mensaje es respuesta a otro)
                qm.body_whmem            AS quoted_body_whmem,
                qm.content_type_whmem    AS quoted_type_whmem,
                qm.caption_whmem         AS quoted_caption_whmem,
                qm.direction_whmem       AS quoted_direction_whmem,
                qm.attachment_type_whmem AS quoted_attachment_type_whmem
            FROM wha_chat c
            JOIN wha_mensaje m
              ON m.wa_id_whmem          = c.wa_id_whcha
             AND m.phone_number_id_whmem = c.phone_number_id_whcha
            LEFT JOIN sis_usuario u ON m.ide_usua_whmem = u.ide_usua
            LEFT JOIN wha_mensaje qm
              ON m.wa_id_context_whmem IS NOT NULL
             AND qm.id_whmem             = m.wa_id_context_whmem
             AND qm.phone_number_id_whmem = c.phone_number_id_whcha
            WHERE c.ide_whcha = $1
            ORDER BY m.ide_whmem
        `);
        query.addIntParam(1, dto.chatId);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna el array de las listas en las que se encuentra un contacto
     * @param dto
     * @returns  [1,2]
     */
    async getListasContacto(dto: TelefonoDto) {
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
        const result = data.map((item) => item.ide_whlis);
        return result;
    }

    /**
     * Busca un contacto por nombre o numero, retorna 25 coincidencias
     * @param dto
     * @returns
     */
    async searchContacto(dto: SearchChatDto & HeaderParamsDto) {
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
        m.body_whmem,
        m.fecha_whmem,
        m.content_type_whmem,
        m.direction_whmem,
        no_leidos_whcha,
        nombre_wheti,
        color_wheti,
        a.ide_wheti
    FROM wha_chat a
    INNER JOIN wha_cuenta cu ON cu.ide_empr = $1 AND cu.activo_whcue = TRUE
               AND cu.id_cuenta_whcue = a.phone_number_id_whcha
    LEFT JOIN LATERAL (
        SELECT body_whmem, content_type_whmem, direction_whmem, fecha_whmem
        FROM wha_mensaje
        WHERE phone_number_id_whmem = a.phone_number_id_whcha
          AND wa_id_whmem = a.wa_id_whcha
        ORDER BY fecha_whmem DESC
        LIMIT 1
    ) m ON TRUE
    LEFT JOIN wha_etiqueta c ON a.ide_wheti = c.ide_wheti
    WHERE (
        unaccent(LOWER(a.name_whcha))   ILIKE '%' || unaccent(LOWER($2)) || '%'
        OR unaccent(LOWER(a.nombre_whcha)) ILIKE '%' || unaccent(LOWER($3)) || '%'
        OR unaccent(LOWER(f_phone_number(a.wa_id_whcha))) ILIKE '%' || unaccent(LOWER($4)) || '%'
    )
    ORDER BY nombre_whcha
    LIMIT ${dto.resultados}
    `);
        query.addIntParam(1, dto.ideEmpr);
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
        const query = new SelectQuery(
            `
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
        `,
            dto,
        );
        query.addParam(1, dto.ide_whlis);
        const data = await this.dataSource.createSelectQuery(query);
        return data;
    }

    /**
     * Busca  texto en mensajes
     * @param dto
     * @returns
     */
    async findTextoMensajes(dto: SearchChatDto & HeaderParamsDto) {
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
            FROM wha_mensaje b
            INNER JOIN wha_chat a ON b.wa_id_whmem = a.wa_id_whcha
            INNER JOIN wha_cuenta cu ON cu.ide_empr = $1 AND cu.activo_whcue = TRUE
                       AND cu.id_cuenta_whcue = a.phone_number_id_whcha
            WHERE (
                unaccent(LOWER(b.body_whmem))    ILIKE '%' || unaccent(LOWER($2)) || '%'
                OR unaccent(LOWER(b.caption_whmem)) ILIKE '%' || unaccent(LOWER($3)) || '%'
            )
            ORDER BY a.fecha_msg_whcha DESC
            LIMIT ${dto.resultados}
            `);
        query.addIntParam(1, dto.ideEmpr);
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
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna la info de un file
     * @param id
     * @returns
     */
    async getFile(id: string) {
        const queryFile = new SelectQuery(`
            SELECT
                m.ide_whmem,
                m.attachment_id_whmem,
                m.attachment_type_whmem,
                m.attachment_name_whmem,
                m.attachment_url_whmem,
                m.attachment_size_whmem,
                m.content_type_whmem,
                m.phone_number_id_whmem,
                m.tipo_whmem,
                c.ide_empr
            FROM wha_mensaje m
            LEFT JOIN wha_cuenta c ON c.id_cuenta_whcue = m.phone_number_id_whmem
                                  AND c.activo_whcue = TRUE
            WHERE m.attachment_id_whmem = $1
        `);
        queryFile.addStringParam(1, id);
        return this.dataSource.createSingleQuery(queryFile);
    }

    /**
     * Guarda un mensaje enviado en la base de datos.
     * @param dto - DTO con los datos del mensaje.
     */
    async saveMensajeEnviado(dto: EnviarMensajeDto & HeaderParamsDto) {
        try {
            const cuentaQ = new SelectQuery(`SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $1 AND activo_whcue = TRUE LIMIT 1`);
            cuentaQ.addIntParam(1, dto.ideEmpr);
            const cuenta = await this.dataSource.createSingleQuery(cuentaQ);
            if (!cuenta) throw new BadRequestException('No existe cuenta WhatsApp configurada');

            // El agente está respondiendo → leyó los mensajes → se resetea el contador
            const updateQuery = new UpdateQuery('wha_chat', 'ide_whcha');
            updateQuery.values.set('id_whcha', dto.idWts);
            updateQuery.values.set('no_leidos_whcha', 0);
            updateQuery.values.set('leido_whcha', true);
            updateQuery.where = 'wa_id_whcha = $1';
            updateQuery.addParam(1, dto.telefono);
            await this.dataSource.createQuery(updateQuery);

            const insertQuery = new InsertQuery('wha_mensaje', 'uuid');
            insertQuery.values.set('phone_number_id_whmem', cuenta.id_cuenta_whcue);
            insertQuery.values.set('wa_id_whmem', dto.telefono);
            insertQuery.values.set('id_whmem', dto.idWts);
            insertQuery.values.set('body_whmem', dto.texto || '');
            insertQuery.values.set('fecha_whmem', new Date().toISOString());
            insertQuery.values.set('content_type_whmem', dto.tipo);
            insertQuery.values.set('leido_whmem', false);
            insertQuery.values.set('direction_whmem', 1);
            insertQuery.values.set('attachment_name_whmem', dto.fileName);
            insertQuery.values.set('attachment_type_whmem', dto.mimeType);
            insertQuery.values.set('tipo_whmem', 'YCLOUD');
            insertQuery.values.set('attachment_id_whmem', dto.mediaId);
            const res = await this.dataSource.createQuery(insertQuery);
            this.whatsappGateway.sendMessageToClients(dto.telefono.replace(/^\+/, ''));
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
     * Total de chats no leídos para una empresa
     */
    async getTotalChatsNoLeidos(ideEmpr: number): Promise<number> {
        const query = new SelectQuery(`
            SELECT COUNT(1)::int AS total
            FROM wha_chat
            WHERE leido_whcha = FALSE
            AND phone_number_id_whcha = (
                SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $1 AND activo_whcue = TRUE LIMIT 1
            )
        `);
        query.addIntParam(1, ideEmpr);
        const res = await this.dataSource.createSingleQuery(query);
        return res?.total ?? 0;
    }

    /**
     * Total de chats no leídos buscando por phone_number_id (número de la empresa).
     * Útil cuando solo se dispone del phoneNumberId del webhook.
     */
    async getTotalChatsNoLeidosByPhoneId(phoneNumberId: string): Promise<{ ideEmpr: number; total: number } | null> {
        const query = new SelectQuery(`
            SELECT cu.ide_empr, COUNT(c.ide_whcha)::int AS total
            FROM wha_cuenta cu
            LEFT JOIN wha_chat c
              ON c.phone_number_id_whcha = cu.id_cuenta_whcue
             AND c.leido_whcha = FALSE
            WHERE cu.id_cuenta_whcue = $1
              AND cu.activo_whcue = TRUE
            GROUP BY cu.ide_empr
        `);
        query.addStringParam(1, phoneNumberId);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Marca como leidos todos los mensajes de un chat y emite el total actualizado por socket
     */
    async setMensajesLeidosChat(dto: GetMensajesDto & { ideEmpr?: number }) {
        const updateQuery = new UpdateQuery('wha_chat', 'ide_whcha');
        updateQuery.values.set('no_leidos_whcha', 0);
        updateQuery.values.set('leido_whcha', true);
        updateQuery.where = 'ide_whcha = $1';
        updateQuery.addIntParam(1, dto.chatId);
        const result = await this.dataSource.createQuery(updateQuery);
        if (dto.ideEmpr) {
            const total = await this.getTotalChatsNoLeidos(dto.ideEmpr);
            this.whatsappGateway.emitTotalChatsNoLeidos(dto.ideEmpr, total);
        }
        return result;
    }

    /**
     * Marca como no leido un chat
     */
    async setChatNoLeido(dto: ChatNoLeidoDto & HeaderParamsDto) {
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('leido_whcha', dto.leido);
        if (dto.chatId != null) {
            updateQuery.where = 'ide_whcha = $1';
            updateQuery.addIntParam(1, dto.chatId);
        } else {
            updateQuery.where = 'wa_id_whcha = $1 AND phone_number_id_whcha = (SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $2 AND activo_whcue = TRUE LIMIT 1)';
            updateQuery.addParam(1, dto.telefono);
            updateQuery.addIntParam(2, dto.ideEmpr);
        }
        return await this.dataSource.createQuery(updateQuery);
    }

    async setChatFavorito(dto: ChatFavoritoDto & HeaderParamsDto) {
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('favorito_whcha', dto.favorito);
        updateQuery.where = 'wa_id_whcha = $1 AND phone_number_id_whcha = (SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $2 AND activo_whcue = TRUE LIMIT 1)';
        updateQuery.addParam(1, dto.telefono);
        updateQuery.addIntParam(2, dto.ideEmpr);
        return await this.dataSource.createQuery(updateQuery);
    }

    async setEtiquetaChat(dto: ChatEtiquetaDto & HeaderParamsDto) {
        const updateQuery = new UpdateQuery('wha_chat', 'uuid');
        updateQuery.values.set('ide_wheti', dto.etiqueta);
        updateQuery.where = 'wa_id_whcha = $1 AND phone_number_id_whcha = (SELECT id_cuenta_whcue FROM wha_cuenta WHERE ide_empr = $2 AND activo_whcue = TRUE LIMIT 1)';
        updateQuery.addParam(1, dto.telefono);
        updateQuery.addIntParam(2, dto.ideEmpr);
        return await this.dataSource.createQuery(updateQuery);
    }

    // ================================= CAMPAÑAS

    /**
     * Obtine los agentes de la cuenta de whatsapp
     * @param dto
     * @returns
     */
    async getListaCampanias(dto: QueryOptionsDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
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
        LEFT JOIN 
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
            u.nom_usua`,
            dto,
        );
        query.addParam(1, dto.ideEmpr);
        return await this.dataSource.createQuery(query);
    }

    async getDetalleCampania(dto: GetDetalleCampaniaDto & HeaderParamsDto) {
        const query = new SelectQuery(
            `
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
            d.ide_whdenv`,
            dto,
        );
        query.addParam(1, dto.ide_whcenv);
        return this.dataSource.createSelectQuery(query);
    }

    async getCampaniaById(dto: EnviarCampaniaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT 
            cab.ide_whcenv, 
            cab.hora_ingre AS fecha, 
            cab.descripcion_whcenv, 
            cab.mensaje_whcenv     ,   
            nombre_whesce,
            cab.activo_whcenv, 
            t.nombre_whtice, 
            u.nom_usua,                         
            COUNT(det.ide_whdenv) AS total_detalle,
            SUM(CASE WHEN det.id_mensaje_whden IS NOT NULL THEN 1 ELSE 0 END) AS total_enviados_exito,
            cab.programado_whcenv, 
            cab.hora_progra_whcenv, 
            cab.ide_whesce,
            color_whesce,
            cab.ide_whtice,
            cab.media_whcenv
        FROM 
            wha_cab_camp_envio cab 
        LEFT JOIN 
            wha_tipo_camp_envio t ON cab.ide_whtice = t.ide_whtice
        INNER JOIN 
        wha_estado_camp_envio e ON cab.ide_whesce = e.ide_whesce
        LEFT JOIN 
            sis_usuario u ON cab.ide_usua = u.ide_usua
        INNER JOIN 
            wha_cuenta c ON cab.ide_whcue = c.ide_whcue
        LEFT JOIN 
            wha_det_camp_envio det ON cab.ide_whcenv = det.ide_whcenv
        WHERE 
            cab.ide_whcenv = $1
            AND c.ide_empr = $2
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
            u.nom_usua`);
        query.addParam(1, dto.ide_whcenv);
        query.addParam(1, dto.ideEmpr);
        const cabecera = await this.dataSource.createSingleQuery(query);

        // if (isDefined( cabecera) === false) {
        //     throw new BadRequestException(`La campaña de id ${dto.ide_whcenv} no existe`);
        // }

        const detalles = await this.getDetalleCampania(dto);
        return {
            cabecera: cabecera || undefined,
            detalles: detalles || [],
        };
    }

    async isTelefonoWhatsAppValidado(telefono: string) {
        const query = new SelectQuery(`
        SELECT f_existe_telefono_whatsapp($1) AS existe`);
        query.addParam(1, telefono);
        const res = await this.dataSource.createSingleQuery(query);
        return res.existe === true;
    }

    /**
     * Info completa de un chat para el panel derecho de la interfaz.
     * Incluye ventana 24h, bot, agente asignado.
     */
    async getChatInfo(ideWhcha: number, ideEmpr: number) {
        const query = new SelectQuery(`
            SELECT
                c.ide_whcha,
                c.wa_id_whcha,
                c.phone_number_id_whcha,
                c.phone_number_whcha,
                c.name_whcha,
                c.nombre_whcha,
                c.fecha_crea_whcha,
                c.fecha_msg_whcha,
                c.leido_whcha,
                c.favorito_whcha,
                c.notas_whcha,
                c.ide_wheti,
                et.nombre_wheti,
                et.color_wheti,
                -- Bot
                c.bot_activo_whcha,
                c.bot_modo_whcha,
                -- Agente
                c.ide_usua_asignado_whcha,
                c.hora_asignacion_whcha,
                u.nom_usua           AS nombre_agente,
                u.avatar_usua        AS avatar_agente,
                -- Ventana 24h (para habilitar/deshabilitar el input de envío)
                c.ultimo_ingreso_cliente_whcha,
                EXTRACT(EPOCH FROM (NOW() - c.ultimo_ingreso_cliente_whcha))::INT AS segundos_desde_cliente,
                CASE
                  WHEN c.ultimo_ingreso_cliente_whcha IS NULL THEN FALSE
                  WHEN EXTRACT(EPOCH FROM (NOW() - c.ultimo_ingreso_cliente_whcha)) <= 86400 THEN TRUE
                  ELSE FALSE
                END                  AS ventana_activa,
                -- Sesión de bot activa (si la hay)
                bs.ide_whbse,
                bs.estado            AS estado_sesion_bot
            FROM wha_chat c
            LEFT JOIN wha_etiqueta  et ON et.ide_wheti = c.ide_wheti
            LEFT JOIN sis_usuario   u  ON u.ide_usua   = c.ide_usua_asignado_whcha
            LEFT JOIN wha_bot_sesion bs ON bs.ide_whcha = c.ide_whcha AND bs.activa = TRUE
            WHERE c.ide_whcha = $1
            LIMIT 1
        `);
        query.addIntParam(1, ideWhcha);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Lista de chats filtrada por modo bot / agente / estado.
     * filtro: 'todos' | 'bot' | 'asesor' | 'sin_asignar' | 'asignado_a_mi'
     */
    async getChatsPorFiltro(ideEmpr: number, ideUsua: number, filtro: string) {
        const filtroCond = {
            todos: '',
            bot: `AND c.bot_modo_whcha = 'BOT'`,
            asesor: `AND c.bot_modo_whcha = 'ASESOR'`,
            sin_asignar: `AND c.ide_usua_asignado_whcha IS NULL`,
            asignado_a_mi: `AND c.ide_usua_asignado_whcha = ${ideUsua}`,
        }[filtro] || '';

        const query = new SelectQuery(`
            SELECT
                c.ide_whcha,
                c.wa_id_whcha,
                c.name_whcha,
                c.nombre_whcha,
                c.phone_number_whcha,
                c.fecha_msg_whcha,
                c.leido_whcha,
                c.favorito_whcha,
                c.no_leidos_whcha,
                c.bot_activo_whcha,
                c.bot_modo_whcha,
                c.ide_usua_asignado_whcha,
                u.nom_usua  AS nombre_agente,
                et.nombre_wheti,
                et.color_wheti,
                -- Último mensaje
                m.body_whmem,
                m.caption_whmem,
                m.content_type_whmem,
                m.direction_whmem,
                m.es_bot_whmem,
                m.fecha_whmem,
                -- Ventana
                CASE
                  WHEN c.ultimo_ingreso_cliente_whcha IS NULL THEN FALSE
                  WHEN EXTRACT(EPOCH FROM (NOW() - c.ultimo_ingreso_cliente_whcha)) <= 86400 THEN TRUE
                  ELSE FALSE
                END AS ventana_activa
            FROM wha_chat c
            INNER JOIN wha_cuenta cu ON cu.ide_empr = $1 AND cu.activo_whcue = TRUE
                       AND cu.id_cuenta_whcue = c.phone_number_id_whcha
            LEFT JOIN LATERAL (
                SELECT body_whmem, caption_whmem, content_type_whmem,
                       direction_whmem, es_bot_whmem, fecha_whmem
                FROM wha_mensaje
                WHERE phone_number_id_whmem = c.phone_number_id_whcha
                  AND wa_id_whmem = c.wa_id_whcha
                ORDER BY fecha_whmem DESC
                LIMIT 1
            ) m ON TRUE
            LEFT JOIN wha_etiqueta et ON et.ide_wheti = c.ide_wheti
            LEFT JOIN sis_usuario  u  ON u.ide_usua   = c.ide_usua_asignado_whcha
            WHERE c.eliminado_whcha = FALSE
            ${filtroCond}
            ORDER BY c.fecha_msg_whcha DESC NULLS LAST
        `);
        query.addIntParam(1, ideEmpr);
        return this.dataSource.createSelectQuery(query);
    }
}
