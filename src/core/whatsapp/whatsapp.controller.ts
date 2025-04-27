import { BadRequestException, Body, Controller, Get, Header, InternalServerErrorException, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { WhatsappService } from './whatsapp.service';
import { MensajeChatDto } from './api/dto/mensaje-chat.dto';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { ServiceDto } from 'src/common/dto/service.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ListaChatDto } from './api/dto/lista-chat.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { ChatFavoritoDto } from './api/dto/chat-favorito.dto';
import { ChatNoLeidoDto } from './api/dto/chat-no-leido.dto';
import { ListContactDto } from './api/dto/list-contact.dto';
import { ChatEtiquetaDto } from './api/dto/chat-etiqueta.dto';
import { GetChatsDto } from './dto/get-chats.dto';
import { ApiOperation } from '@nestjs/swagger';
import { SendLocationDto } from './web/dto/send-location.dto';
import { WhatsappDbService } from './whatsapp-db.service';
import { SearchChatDto } from './dto/search-chat.dto';


@Controller('whatsapp')
export class WhatsappController {

  constructor(private readonly service: WhatsappService,
    private readonly whatsappDbService: WhatsappDbService,
  ) { }

  // ---------------------------- COMMON
  @Post('getChats')
  // @Auth()
  getChats(
    @Body() dtoIn: GetChatsDto
  ) {
    return this.service.getChats(dtoIn);
  }

  @Post('getCuenta')
  // @Auth()
  getCuenta(
    @Body() dtoIn: ServiceDto
  ) {
    return this.whatsappDbService.getCuenta(dtoIn);
  }


  @Post('getMensajes')
  // @Auth()
  getMensajes(
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.getMensajes(dtoIn);
  }


  @Post('enviarMensajeMedia')
  // @Auth()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(), // Usa memoryStorage importado directamente
    limits: {
      fileSize: 50 * 1024 * 1024, // Límite de 50MB
      files: 1
    },
  }))
  async enviarMensajeMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() dtoIn: UploadMediaDto
  ) {
    if (!file) {
      throw new BadRequestException('No se ha subido ningún archivo');
    }

    try {
      return await this.service.enviarMensajeMedia(dtoIn, file);
    } catch (error) {
      throw new InternalServerErrorException(`Error al enviar el mensaje: ${error.message}`);
    }
  }


  @Post('enviarMensajeTexto')
  // @Auth()
  enviarMensajeTexto(
    @Body() dtoIn: EnviarMensajeDto
  ) {
    return this.service.enviarMensajeTexto(dtoIn);
  }


  @Get('download/:ideEmpr/:id')
  @Header('Cache-Control', 'no-store, max-age=0')
  async download(
    @Param('ideEmpr') ideEmpr: string,
    @Param('id') messageId: string,
    @Res() res: Response
  ) {
    const fileInfo = await this.service.downloadMedia(ideEmpr, messageId);
    return await this.service.fileTempService.downloadMediaFile(fileInfo, res);
  }

  // ==============================
  // ---------------------------- API
  @Post('getListasContacto')
  // @Auth()
  getListasContacto(
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.whatsappApi.getListasContacto(dtoIn);
  }


  @Post('getListas')
  // @Auth()
  getListas(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappApi.getListas(dtoIn);
  }


  @Post('getEtiquetas')
  // @Auth()
  getEtiquetas(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappApi.getEtiquetas(dtoIn);
  }

  @Post('validarPermisoAgente')
  // @Auth()
  validarPermisoAgente(
    @Body() dtoIn: ServiceDto
  ) {
    return this.whatsappDbService.validarPermisoAgente(dtoIn);
  }

  @Post('setMensajesLeidosChat')
  // @Auth()
  setMensajesLeidosChat(
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.whatsappApi.setMensajesLeidosChat(dtoIn);
  }

  @Post('setChatNoLeido')
  // @Auth()
  setChatNoLeido(
    @Body() dtoIn: ChatNoLeidoDto
  ) {
    return this.service.whatsappApi.setChatNoLeido(dtoIn);
  }

  @Post('setChatFavorito')
  // @Auth()
  setChatFavorito(
    @Body() dtoIn: ChatFavoritoDto
  ) {
    return this.service.whatsappApi.setChatFavorito(dtoIn);
  }

  @Post('setEtiquetaChat')
  // @Auth()
  setEtiquetaChat(
    @Body() dtoIn: ChatEtiquetaDto
  ) {
    return this.service.whatsappApi.setEtiquetaChat(dtoIn);
  }


  @Post('getContactosLista')
  // @Auth()
  getContactosLista(
    @Body() dtoIn: ListaChatDto
  ) {
    return this.service.whatsappApi.getContactosLista(dtoIn);
  }


  @Post('getTotalMensajes')
  // @Auth()
  getTotalMensajes(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappApi.getTotalMensajes(dtoIn);
  }

  @Post('findContacto')
  // @Auth()
  findContacto(
    @Body() dtoIn: SearchChatDto
  ) {
    return this.service.whatsappApi.findContacto(dtoIn);
  }

  @Post('findTextoMensajes')
  // @Auth()
  findTextoMensajes(
    @Body() dtoIn: SearchChatDto
  ) {
    return this.service.whatsappApi.findTextoMensajes(dtoIn);
  }

  @Post('searchContacto')
  // @Auth()
  searchContacto(
    @Body() dtoIn: SearchChatDto
  ) {
    return this.service.searchContacto(dtoIn);
  }



  @Post('saveListasContacto')
  // @Auth()
  saveListasContacto(
    @Body() dtoIn: ListContactDto
  ) {
    return this.service.whatsappApi.saveListasContacto(dtoIn);
  }


  @Post('activarNumero')
  // @Auth()
  activarNumero(
    @Body() dtoIn: MensajeChatDto
  ) {
    return this.service.whatsappApi.activarNumero(dtoIn);
  }

  // ---------------------------- WEB

  @Post('getStatus')
  @ApiOperation({ summary: 'Post WhatsApp connection status' })
  getStatus(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappWeb.getStatus(dtoIn);
  }

  @Post('getQr')
  @ApiOperation({ summary: 'Post current QR code for authentication' })
  async getQr(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappWeb.getQrCode(dtoIn);
  }


  @Post('logout')
  @ApiOperation({ summary: 'Logout from WhatsApp' })
  async logout(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappWeb.logout(dtoIn);
    // return { success: true };
  }


  @Post('sendLocation')
  @ApiOperation({ summary: 'Send location' })
  async sendLocation(@Body() locationMessage: SendLocationDto) {
    return this.service.whatsappWeb.sendLocation(locationMessage);
  }




  @Get('serveFile/:filename')
  async serveFile(
    @Param('filename') filename: string,
    @Res() response: Response
  ) {
    return this.service.fileTempService.downloadFile(response, filename);
  }


  @Get('getProfilePicture/:ideEmpr/:contactId')
  async getProfilePicture(
    @Param('ideEmpr') ideEmpr: string,
    @Param('contactId') contactId: string,
    @Res() response: Response
  ) {
    return this.service.whatsappWeb.getOrCreateProfilePicture(
      ideEmpr,
      contactId,
      response
    );
  }

}
