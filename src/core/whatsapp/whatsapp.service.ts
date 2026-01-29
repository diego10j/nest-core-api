import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { isDefined } from 'src/util/helpers/common-util';

import { FileTempService } from '../modules/sistema/files/file-temp.service';

import { MediaFile } from './api/interface/whatsapp';
import { WhatsappApiService } from './api/whatsapp-api.service';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { GetChatsDto } from './dto/get-chats.dto';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { SearchChatDto } from './dto/search-chat.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { WhatsappWebService } from './web/whatsapp-web.service';

@Injectable()
export class WhatsappService {
  constructor(
    public readonly whatsappApi: WhatsappApiService,
    public readonly fileTempService: FileTempService,
    public readonly whatsappWeb: WhatsappWebService,
  ) { }

  /**
   * Retorna los mensajes de un chat
   * @param dto
   * @returns
   */
  async getMensajes(dto: GetMensajesDto & HeaderParamsDto) {
    if (dto.telefono === '000000000000') {
      return [];
    }
    const config = await this.whatsappApi.getConfigWhatsApp(dto.ideEmpr);
    if (isDefined(config) === false) throw new BadRequestException('Error al obtener la configuración de WhatsApp');
    if (config.WHATSAPP_TYPE === 'API') {
      return await this.whatsappApi.getMensajes(dto);
    } else if (config.WHATSAPP_TYPE === 'WEB') {
      return await this.whatsappWeb.getMensajes(dto);
    }

    throw new BadRequestException('Tipo de WhatsApp no soportado');
  }

  /**
   * Obtiene todos los mensajes agrupados por número de teléfono
   * @returns Lista de conversaciones agrupadas por número de teléfono
   */
  async getChats(dto: GetChatsDto & HeaderParamsDto) {
    const config = await this.whatsappApi.getConfigWhatsApp(dto.ideEmpr);
    if (isDefined(config) === false) throw new BadRequestException('Error al obtener la configuración de WhatsApp');
    if (config.WHATSAPP_TYPE === 'API') {
      return await this.whatsappApi.getChats(dto);
    } else if (config.WHATSAPP_TYPE === 'WEB') {
      return await this.whatsappWeb.getChats(dto);
    }

    throw new BadRequestException('Tipo de WhatsApp no soportado');
  }

  async searchContacto(dto: SearchChatDto & HeaderParamsDto) {
    const config = await this.whatsappApi.getConfigWhatsApp(dto.ideEmpr);
    if (isDefined(config) === false) throw new BadRequestException('Error al obtener la configuración de WhatsApp');
    if (config.WHATSAPP_TYPE === 'API') {
      return await this.whatsappApi.searchContacto(dto);
    } else if (config.WHATSAPP_TYPE === 'WEB') {
      return await this.whatsappWeb.searchContacto(dto);
    }

    throw new BadRequestException('Tipo de WhatsApp no soportado');
  }

  async enviarMensajeTexto(dto: EnviarMensajeDto & HeaderParamsDto) {
    const config = await this.whatsappApi.getConfigWhatsApp(dto.ideEmpr);
    if (isDefined(config) === false) throw new BadRequestException('Error al obtener la configuración de WhatsApp');
    if (config.WHATSAPP_TYPE === 'API') {
      return await this.whatsappApi.enviarMensajeTexto(dto);
    } else if (config.WHATSAPP_TYPE === 'WEB') {
      return await this.whatsappWeb.enviarMensajeTexto(dto);
    }

    throw new BadRequestException('Tipo de WhatsApp no soportado');
  }

  async enviarMensajeMedia(dto: UploadMediaDto & HeaderParamsDto, file: Express.Multer.File) {
    if (!file?.buffer) {
      throw new Error('Archivo no válido o vacío');
    }
    const config = await this.whatsappApi.getConfigWhatsApp(Number(dto.ideEmpr));
    if (isDefined(config) === false) throw new BadRequestException('Error al obtener la configuración de WhatsApp');
    if (config.WHATSAPP_TYPE === 'API') {
      return await this.whatsappApi.enviarMensajeMedia(dto, file);
    } else if (config.WHATSAPP_TYPE === 'WEB') {
      return await this.whatsappWeb.enviarMensajeMedia(dto, file);
    }
    throw new BadRequestException('Tipo de WhatsApp no soportado');
  }

  async downloadMedia(ideEmpr: string, messageId: string): Promise<MediaFile> {
    const config = await this.whatsappApi.getConfigWhatsApp(Number(ideEmpr));
    if (isDefined(config) === false) throw new BadRequestException('Error al obtener la configuración de WhatsApp');
    if (config.WHATSAPP_TYPE === 'API') {
      return await this.whatsappApi.download(ideEmpr, messageId);
    } else if (config.WHATSAPP_TYPE === 'WEB') {
      return await this.whatsappWeb.download(ideEmpr, messageId);
    }
    throw new BadRequestException('Tipo de WhatsApp no soportado');
  }

  /**
   * Sube un archivo y lo guarda en temporales
   */
  async uploadMediaFile(file: Express.Multer.File) {
    const result = await this.fileTempService.saveTempFile(
      file.buffer, // Buffer del archivo
      file.originalname.split('.').pop(), // Extensión del archivo
    );
    return { fileName: result.fileName };
  }
}
