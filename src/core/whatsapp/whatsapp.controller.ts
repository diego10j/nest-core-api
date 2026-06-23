import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';


import { FILE_STORAGE_CONSTANTS } from '../modules/sistema/files/constants/files.constants';

import { ChatEtiquetaDto } from './api/dto/chat-etiqueta.dto';
import { ChatFavoritoDto } from './api/dto/chat-favorito.dto';
import { ChatNoLeidoDto } from './api/dto/chat-no-leido.dto';
import { ListContactDto } from './api/dto/list-contact.dto';
import { ListaChatDto } from './api/dto/lista-chat.dto';
import { MensajeChatDto } from './api/dto/mensaje-chat.dto';
import { EnviarCampaniaDto } from './dto/enviar-campania.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { GetChatsDto } from './dto/get-chats.dto';
import { GetDetalleCampaniaDto } from './dto/get-detalle-camp';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { SaveCampaniaDto } from './dto/save-campania.dto';
import { TelefonoDto } from './dto/telefono.dto';
import { SearchChatDto } from './dto/search-chat.dto';
import { UpdateEstadoCampaniaDto } from './dto/update-estado-campania';
import { UploadMediaDto } from './dto/upload-media.dto';
import { BotConfigService } from './bot/bot-config.service';
import { BotService } from './bot/bot.service';
import { WhatsappCampaniaService } from './whatsapp-camp.service';
import { WhatsappDbService } from './whatsapp-db.service';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly service: WhatsappService,
    private readonly whatsappDbService: WhatsappDbService,
    private readonly whatsappCamp: WhatsappCampaniaService,
    private readonly botConfig: BotConfigService,
    private readonly botService: BotService,
  ) { }

  // ---------------------------- COMMON
  @Get('getChats')
  // @Auth()
  getChats(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetChatsDto) {
    return this.service.getChats({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCuenta')
  // @Auth()
  async getCuenta(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.whatsappDbService.getCuenta(headersParams.ideEmpr);
  }

  @Get('getMensajes')
  // @Auth()
  async getMensajes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetMensajesDto) {
    return this.service.getMensajes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('enviarMensajeMedia')
  // @Auth()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Usa memoryStorage importado directamente
      limits: {
        fileSize: FILE_STORAGE_CONSTANTS.MAX_FILE_SIZE,
        files: 1,
      },
    }),
  )
  async enviarMensajeMedia(
    @AppHeaders() headersParams: HeaderParamsDto,
    @UploadedFile() file: Express.Multer.File,
    @Body() dtoIn: UploadMediaDto,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha subido ningún archivo');
    }

    try {
      return await this.service.enviarMensajeMedia(
        {
          ...headersParams,
          ...dtoIn,
        },
        file,
      );
    } catch (error) {
      throw new InternalServerErrorException(`Error al enviar el mensaje: ${error.message}`);
    }
  }

  @Post('uploadMediaFile')
  // @Auth()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Usa memoryStorage importado directamente
      limits: {
        fileSize: FILE_STORAGE_CONSTANTS.MAX_FILE_SIZE,
        files: 1,
      },
    }),
  )
  uploadMedia(@AppHeaders() _headersParams: HeaderParamsDto, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadMediaFile(file);
  }

  @Post('enviarMensajeTexto')
  // @Auth()
  enviarMensajeTexto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: EnviarMensajeDto) {
    return this.service.enviarMensajeTexto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('media/:filename')
  @Header('Cache-Control', 'public, max-age=86400')
  async serveMedia(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = this.service.fileTempService.getWhatsAppMediaPath(filename);
    res.sendFile(filePath, (err) => {
      if (err) res.status(404).json({ message: 'Archivo no encontrado' });
    });
  }

  @Get('download/:ideEmpr/:id')
  async download(
    @Param('ideEmpr') ideEmpr: string,
    @Param('id') messageId: string,
    @Res() res: Response,
  ) {
    const fileInfo = await this.service.downloadMedia(ideEmpr, messageId);
    if (fileInfo.url?.startsWith('https://')) {
      return res.redirect(fileInfo.url);
    }
    return res.redirect(`/api/whatsapp/media/${fileInfo.url}`);
  }

  @Get('getAgentesCuenta')
  // @Auth()
  getAgentesCuenta(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.whatsappDbService.getAgentesCuenta({
      ...headersParams,
      ...dtoIn,
    });
  }

  // ==============================
  // ---------------------------- API
  @Get('getListasContacto')
  // @Auth()
  getListasContacto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TelefonoDto) {
    return this.service.whatsappApi.getListasContacto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListas')
  // @Auth()
  getListas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.whatsappApi.getListas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getEtiquetas')
  // @Auth()
  getEtiquetas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.whatsappApi.getEtiquetas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getPermisoAgente')
  // @Auth()
  getPermisoAgente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.whatsappDbService.validarPermisoAgente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('setMensajesLeidosChat')
  // @Auth()
  setMensajesLeidosChat(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GetMensajesDto) {
    return this.service.whatsappApi.setMensajesLeidosChat({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('setChatNoLeido')
  // @Auth()
  setChatNoLeido(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ChatNoLeidoDto) {
    return this.service.whatsappApi.setChatNoLeido({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('setChatFavorito')
  // @Auth()
  setChatFavorito(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ChatFavoritoDto) {
    return this.service.whatsappApi.setChatFavorito({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('setEtiquetaChat')
  // @Auth()
  setEtiquetaChat(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ChatEtiquetaDto) {
    return this.service.whatsappApi.setEtiquetaChat({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getContactosLista')
  // @Auth()
  getContactosLista(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ListaChatDto) {
    return this.service.whatsappApi.getContactosLista({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalMensajes')
  // @Auth()
  getTotalMensajes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.whatsappApi.getTotalMensajes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('findContacto')
  // @Auth()
  findContacto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchChatDto) {
    return this.service.whatsappApi.findContacto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('findTextoMensajes')
  // @Auth()
  findTextoMensajes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchChatDto) {
    return this.service.whatsappApi.findTextoMensajes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('searchContacto')
  // @Auth()
  searchContacto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchChatDto) {
    return this.service.searchContacto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveListasContacto')
  // @Auth()
  saveListasContacto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ListContactDto) {
    return this.service.whatsappApi.saveListasContacto({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('activarNumero')
  // @Auth()
  activarNumero(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: MensajeChatDto) {
    return this.service.whatsappApi.activarNumero({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('validateWhatsAppNumber')
  @ApiOperation({ summary: 'Valida si un número tiene WhatsApp activo (Cloud API)' })
  async validateWhatsAppNumber(@AppHeaders() headersParams: HeaderParamsDto, @Query('telefono') telefono: string) {
    return this.service.whatsappApi.validateWhatsAppNumber(headersParams.ideEmpr, telefono);
  }

  @Get('getServeFile/:filename')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Descarga un archivo temporal del servidor' })
  async getServeFile(
    @AppHeaders() _h: HeaderParamsDto,
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    return this.service.fileTempService.downloadFile(response, filename);
  }

  // ---------------------------- CAMPAÑAS

  @Get('getListaCampanias')
  // @Auth()
  getListaCampanias(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.whatsappDbService.getListaCampanias({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDetalleCampania')
  // @Auth()
  getDetalleCampania(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetalleCampaniaDto) {
    return this.whatsappDbService.getDetalleCampania({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('sendCampania')
  // @Auth()
  sendCampania(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: EnviarCampaniaDto) {
    return this.whatsappCamp.sendCampania({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveCampania')
  // @Auth()
  saveCampania(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCampaniaDto) {
    return this.whatsappCamp.saveCampania({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Delete('deleteDetailCampaniaById')
  // @Auth()
  deleteDetailCampaniaById(@AppHeaders() _headersParams: HeaderParamsDto, @Body() dtoIn: IdeDto) {
    return this.whatsappCamp.deleteDetailCampaniaById(dtoIn.ide);
  }

  @Post('updateEstadoCampania')
  // @Auth()
  updateEstadoCampania(@AppHeaders() _headersParams: HeaderParamsDto, @Body() dtoIn: UpdateEstadoCampaniaDto) {
    return this.whatsappCamp.updateCampaignStatus(dtoIn.ide_whcenv, dtoIn.ide_whesce);
  }

  @Get('getCampaniaById')
  // @Auth()
  getCampaniaById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EnviarCampaniaDto) {
    return this.whatsappDbService.getCampaniaById({
      ...headersParams,
      ...dtoIn,
    });
  }

  // ─── Bot por chat ──────────────────────────────────────────────

  /**
   * Habilitar / deshabilitar el bot para UN chat específico.
   * Independiente del toggle global: el bot global puede estar ON
   * pero este chat en particular puede tener bot OFF (modo ASESOR).
   */
  @Post('bot/toggle-chat')
  @ApiOperation({ summary: 'Activar o desactivar el bot para un chat específico' })
  async toggleBotChat(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: { ideWhcha: number; activar: boolean },
  ) {
    if (dto.activar) {
      await this.botService.liberarChat(dto.ideWhcha);
      return { ok: true, bot_modo_whcha: 'BOT' };
    } else {
      // Silenciar el bot en este chat sin enviar mensaje
      await this.whatsappDbService.dataSource.pool.query(
        `UPDATE wha_chat SET bot_activo_whcha = FALSE, bot_modo_whcha = 'ASESOR' WHERE ide_whcha = $1`,
        [dto.ideWhcha],
      );
      return { ok: true, bot_modo_whcha: 'ASESOR' };
    }
  }

  /**
   * Info completa de un chat: datos del contacto + ventana 24h + estado bot + agente.
   * Usado al abrir el panel derecho de la interfaz.
   */
  @Get('getChatInfo/:ideWhcha')
  @ApiOperation({ summary: 'Info de un chat: contacto, ventana 24h, bot, agente asignado' })
  async getChatInfo(
    @AppHeaders() h: HeaderParamsDto,
    @Param('ideWhcha', ParseIntPipe) ideWhcha: number,
  ) {
    return this.whatsappDbService.getChatInfo(ideWhcha, h.ideEmpr);
  }

  /**
   * Filtrar lista de chats por modo del bot.
   * filtro: 'todos' | 'bot' | 'asesor' | 'sin_asignar' | 'asignado_a_mi'
   */
  @Get('getChatsPorFiltro')
  @ApiOperation({ summary: 'Chats filtrados por modo bot/asesor/asignación' })
  async getChatsPorFiltro(
    @AppHeaders() h: HeaderParamsDto,
    @Query('filtro') filtro: string,
  ) {
    return this.whatsappDbService.getChatsPorFiltro(h.ideEmpr, h.ideUsua, filtro || 'todos');
  }
}
