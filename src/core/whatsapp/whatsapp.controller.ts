import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  InternalServerErrorException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { ChatNoLeidoDto } from './api/dto/chat-no-leido.dto';
import { ListContactDto } from './api/dto/list-contact.dto';
import { ChatEtiquetaDto } from './api/dto/chat-etiqueta.dto';
import { GetChatsDto } from './dto/get-chats.dto';
import { ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { EnviarUbicacionDto } from './web/dto/send-location.dto';
import { GetDetalleCampaniaDto } from './dto/get-detalle-camp';
import { WhatsappCampaniaService } from './whatsapp-camp.service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { TelefonoWebDto } from './web/dto/telefono-web.dto';
import { ContactIdWebDto } from './web/dto/contact-id-web.dto';
import { EnviarCampaniaDto } from './dto/enviar-campania.dto';
import { SaveCampaniaDto } from './dto/save-campania.dto';
import { FILE_STORAGE_CONSTANTS } from '../modules/sistema/files/file-temp.service';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { ChatFavoritoDto } from './api/dto/chat-favorito.dto';
import { ListaChatDto } from './api/dto/lista-chat.dto';
import { MensajeChatDto } from './api/dto/mensaje-chat.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { SearchChatDto } from './dto/search-chat.dto';
import { UpdateEstadoCampaniaDto } from './dto/update-estado-campania';
import { UploadMediaDto } from './dto/upload-media.dto';
import { WhatsappDbService } from './whatsapp-db.service';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly service: WhatsappService,
    private readonly whatsappDbService: WhatsappDbService,
    private readonly whatsappCamp: WhatsappCampaniaService,
  ) {}

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

  @Get('download/:ideEmpr/:id')
  @Header('Cache-Control', 'public, max-age=3600')
  async download(
    @Param('ideEmpr') ideEmpr: string, // Quitar ****
    @Param('id') messageId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const fileInfo = await this.service.downloadMedia(ideEmpr, messageId);
    return await this.service.fileTempService.downloadMediaFile(fileInfo, req, res);
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
  getListasContacto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetMensajesDto) {
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

  // ---------------------------- WEB

  @Get('getStatus')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  getStatus(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.whatsappWeb.getStatus({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getQr')
  @ApiOperation({ summary: 'Get current QR code for authentication' })
  async getQr(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.whatsappWeb.getQrCode({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('validateWhatsAppNumber')
  @ApiOperation({ summary: 'Get validateWhatsAppNumber' })
  async validateWhatsAppNumber(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TelefonoWebDto) {
    return this.service.whatsappWeb.validateWhatsAppNumber(headersParams.ideEmpr, dtoIn.telefono);
  }

  @Get('getContactInfo')
  @ApiOperation({ summary: 'Get getContactInfo' })
  async getContactInfo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ContactIdWebDto) {
    return this.service.whatsappWeb.getContactInfo(headersParams.ideEmpr, dtoIn.contactId);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout from WhatsApp' })
  async logout(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: QueryOptionsDto) {
    return this.service.whatsappWeb.logout({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('enviarUbicacion')
  @ApiOperation({ summary: 'Send location' })
  async enviarUbicacio(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: EnviarUbicacionDto) {
    return this.service.whatsappWeb.enviarUbicacion({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getServeFile/:filename')
  @Header('Cache-Control', 'public, max-age=3600')
  async getServeFile(@Param('filename') filename: string, @Res() response: Response) {
    return this.service.fileTempService.downloadFile(response, filename);
  }

  @Get('getProfilePicture/:ideEmpr/:contactId')
  @Header('Cache-Control', 'public, max-age=3600')
  async getProfilePicture(
    @AppHeaders() _headersParams: HeaderParamsDto,
    @Param('ideEmpr') ideEmpr: string, // Quitar *******
    @Param('contactId') contactId: string,
    @Res() response: Response,
  ) {
    return this.service.whatsappWeb.getOrCreateProfilePicture(ideEmpr, contactId, response);
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
}
