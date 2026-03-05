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

@Injectable()
export class WhatsappService {
  constructor(
    public readonly whatsappApi: WhatsappApiService,
    public readonly fileTempService: FileTempService,
  ) { }

  /**
   * Retorna los mensajes de un chat (Cloud API)
   */
  async getMensajes(dto: GetMensajesDto & HeaderParamsDto) {
    if (dto.telefono === '000000000000') return [];
    await this.assertConfig(dto.ideEmpr);
    return this.whatsappApi.getMensajes(dto);
  }

  /**
   * Lista de conversaciones (chats)
   */
  async getChats(dto: GetChatsDto & HeaderParamsDto) {
    await this.assertConfig(dto.ideEmpr);
    return this.whatsappApi.getChats(dto);
  }

  /**
   * Busca contacto por nombre o número
   */
  async searchContacto(dto: SearchChatDto & HeaderParamsDto) {
    await this.assertConfig(dto.ideEmpr);
    return this.whatsappApi.searchContacto(dto);
  }

  /**
   * Envía mensaje de texto
   */
  async enviarMensajeTexto(dto: EnviarMensajeDto & HeaderParamsDto) {
    await this.assertConfig(dto.ideEmpr);
    return this.whatsappApi.enviarMensajeTexto(dto);
  }

  /**
   * Envía mensaje multimedia (imagen, video, audio, documento)
   */
  async enviarMensajeMedia(dto: UploadMediaDto & HeaderParamsDto, file: Express.Multer.File) {
    if (!file?.buffer) throw new Error('Archivo no válido o vacío');
    await this.assertConfig(Number(dto.ideEmpr));
    return this.whatsappApi.enviarMensajeMedia(dto, file);
  }

  /**
   * Descarga un archivo multimedia desde WhatsApp y lo guarda en temporales
   */
  async downloadMedia(ideEmpr: string, messageId: string): Promise<MediaFile> {
    await this.assertConfig(Number(ideEmpr));
    return this.whatsappApi.download(ideEmpr, messageId);
  }

  /**
   * Sube un archivo y lo guarda en temporales
   */
  async uploadMediaFile(file: Express.Multer.File) {
    const result = await this.fileTempService.saveTempFile(
      file.buffer,
      file.originalname.split('.').pop(),
    );
    return { fileName: result.fileName };
  }

  // ─── Helper ─────────────────────────────────────────────────────────────────

  private async assertConfig(ideEmpr: number) {
    const config = await this.whatsappApi.getConfigWhatsApp(ideEmpr);
    if (!isDefined(config)) {
      throw new BadRequestException('No existe cuenta WhatsApp Business configurada para esta empresa');
    }
    return config;
  }
}
