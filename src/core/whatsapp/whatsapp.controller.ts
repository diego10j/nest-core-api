import { BadRequestException, Body, Controller, Get, Header, InternalServerErrorException, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Request, Response } from 'express';
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
import { GetDetalleCampaniaDto } from './dto/get-detalle-camp';
import { WhatsappCampaniaService } from './whatsapp-camp.service';
import { SaveDetallesCampaniaDto } from './dto/save-det-camp.dto';
import {  HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';


@Controller('whatsapp')
export class WhatsappController {

  constructor(private readonly service: WhatsappService,
    private readonly whatsappDbService: WhatsappDbService,
    private readonly whatsappCamp: WhatsappCampaniaService
  ) { }

  // ---------------------------- COMMON
  @Get('getChats')
  // @Auth()
  getChats(
    @Body() dtoIn: GetChatsDto
  ) {
    return this.service.getChats(dtoIn);
  }

  // @Get('getCuenta')
  // // @Auth()
  // getCuenta(
  //   @Query() dtoIn: ServiceDto
  // ) {
  //   return this.whatsappDbService.getCuenta(dtoIn.ideEmpr);
  // }


  @Get('getCuenta')
  // @Auth()
  async getCuenta(
    @AppHeaders() headersParams: HeaderParamsDto) {
    return this.whatsappDbService.getCuenta(headersParams.ideEmpr);
  }



  @Get('getMensajes')
  // @Auth()
  async getMensajes(
    @AppHeaders() appHeaders: HeaderParamsDto,
    @Query() dtoIn: GetMensajesDto
    ) {
      return this.service.getMensajes({
        ...appHeaders,
        ...dtoIn
      });
  }




  // @Get('getMensajes')
  // // @Auth()
  // getMensajes(
  //   @Body() dtoIn: GetMensajesDto
  // ) {
  //   return this.service.getMensajes(dtoIn);
  // }


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
  @Header('Cache-Control', 'public, max-age=3600')
  async download(
    @Param('ideEmpr') ideEmpr: string,
    @Param('id') messageId: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const fileInfo = await this.service.downloadMedia(ideEmpr, messageId);
    return await this.service.fileTempService.downloadMediaFile(fileInfo, req, res);
  }



  @Get('getAgentesCuenta')
  // @Auth()
  getAgentesCuenta(
    @Body() dtoIn: ServiceDto
  ) {
    return this.whatsappDbService.getAgentesCuenta(dtoIn);
  }

  // ==============================
  // ---------------------------- API
  @Get('getListasContacto')
  // @Auth()
  getListasContacto(
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.whatsappApi.getListasContacto(dtoIn);
  }


  @Get('getListas')
  // @Auth()
  getListas(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappApi.getListas(dtoIn);
  }


  @Get('getEtiquetas')
  // @Auth()
  getEtiquetas(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappApi.getEtiquetas(dtoIn);
  }

  @Get('getPermisoAgente')
  // @Auth()
  getPermisoAgente(
    @Body() dtoIn: ServiceDto
  ) {
    return this.whatsappDbService.validarPermisoAgente(dtoIn);
  }

  @Post('setMensajesLeidosChat')
  // @Auth()
  setMensajesLeidosChat(
    @Body() dtoIn: GetMensajesDto
  ) {
    return 'k'
   // return this.service.whatsappApi.setMensajesLeidosChat(dtoIn);
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


  @Get('getContactosLista')
  // @Auth()
  getContactosLista(
    @Body() dtoIn: ListaChatDto
  ) {
    return this.service.whatsappApi.getContactosLista(dtoIn);
  }


  @Get('getTotalMensajes')
  // @Auth()
  getTotalMensajes(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappApi.getTotalMensajes(dtoIn);
  }

  @Get('findContacto')
  // @Auth()
  findContacto(
    @Body() dtoIn: SearchChatDto
  ) {
    return this.service.whatsappApi.findContacto(dtoIn);
  }

  @Get('findTextoMensajes')
  // @Auth()
  findTextoMensajes(
    @Body() dtoIn: SearchChatDto
  ) {
    return this.service.whatsappApi.findTextoMensajes(dtoIn);
  }

  @Get('searchContacto')
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

  @Get('getStatus')
  @ApiOperation({ summary: 'Post WhatsApp connection status' })
  getStatus(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.whatsappWeb.getStatus(dtoIn);
  }

  @Get('getQr')
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


  @Get('getServeFile/:filename')
  @Header('Cache-Control', 'public, max-age=3600')
  async getServeFile(
    @Param('filename') filename: string,
    @Res() response: Response
  ) {
    return this.service.fileTempService.downloadFile(response, filename);
  }


  @Get('getProfilePicture/:ideEmpr/:contactId')
  @Header('Cache-Control', 'public, max-age=3600')
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


  // ---------------------------- CAMPAÑAS


  @Get('getListaCampanias')
  // @Auth()
  getListaCampanias(
    @Body() dtoIn: ServiceDto
  ) {
    return this.whatsappDbService.getListaCampanias(dtoIn);
  }

  @Get('getDetalleCampania')
  // @Auth()
  getDetalleCampania(
    @Body() dtoIn: GetDetalleCampaniaDto
  ) {
    return this.whatsappDbService.getDetalleCampania(dtoIn);
  }

  @Post('saveDetalleCampania')
  // @Auth()
  saveDetalleCampania(
    @Body() dtoIn: SaveDetallesCampaniaDto
  ) {
    return this.whatsappCamp.saveDetalleCampania(dtoIn);
  }

}
