import { Body, Controller, Get, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { ServiceDto } from 'src/common/dto/service.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ListaChatDto } from './dto/lista-chat.dto';
import { FindChatDto } from './dto/find-chat.dto';
import { GetUrlArchivoDto } from './dto/get-url-media.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { openInBrowserMimeTypes } from 'src/util/helpers/download-image-as-png';
import { ChatFavoritoDto } from './dto/chat-favorito.dto';
import { ChatNoLeidoDto } from './dto/chat-no-leido.dto';


@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly service: WhatsappService) { }


  @Post('getChats')
  // @Auth()
  getChats(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getChats(dtoIn);
  }

  @Post('getCuenta')
  // @Auth()
  getCuenta(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getCuenta(dtoIn);
  }


  @Post('getListas')
  // @Auth()
  getListas(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListas(dtoIn);
  }

  @Post('getMensajes')
  // @Auth()
  getMensajes(
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.getMensajes(dtoIn);
  }

  @Post('getListasContacto')
  // @Auth()
  getListasContacto(
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.getListasContacto(dtoIn);
  }




  @Post('enviarMensajeTexto')
  // @Auth()
  enviarMensajeTexto(
    @Body() dtoIn: EnviarMensajeDto
  ) {
    return this.service.enviarMensajeTexto(dtoIn);
  }



  @Post('getUrlArchivo')
  // @Auth()
  getUrlArchivo(
    @Body() dtoIn: GetUrlArchivoDto
  ) {
    return this.service.getUrlArchivo(dtoIn);
  }


  @Get('download/:ideEmpr/:id')
  async download(
    @Res() res: Response,
    @Param('id') id: string
  ) {
    try {
      const file = await this.service.download(id);

      // Nombre del archivo (puedes personalizarlo)
      const fileName = file.fileName;
      console.log(fileName);
      // Configurar los encabezados de la respuesta
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // Configurar otros encabezados
      res.set({
        'Content-Type': file.contentType,
        'Content-Length': file.fileSize,
      });

      // Enviar los datos binarios como respuesta
      res.send(file.data);
    } catch (error) {
      console.error('❌ Error en el controlador download:', error);
      res.status(500).send('Error al descargar el archivo');
    }
  }


  @Post('getProfile')
  // @Auth()
  getProfile(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getProfile(dtoIn);
  }

  @Post('validarPermisoAgente')
  // @Auth()
  validarPermisoAgente(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.validarPermisoAgente(dtoIn);
  }



  @Post('enviarMensajeMedia')
  // @Auth()
  @UseInterceptors(FileInterceptor('file'))
  async enviarMensajeMedia(@UploadedFile() file: Express.Multer.File,
    @Body() dtoIn: UploadMediaDto) {
    return this.service.enviarMensajeMedia(dtoIn, file);
  }


  @Post('setMensajesLeidosChat')
  // @Auth()
  setMensajesLeidosChat(
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.setMensajesLeidosChat(dtoIn);
  }


  @Post('setChatNoLeido')
  // @Auth()
  setChatNoLeido(
    @Body() dtoIn: ChatNoLeidoDto
  ) {
    return this.service.setChatNoLeido(dtoIn);
  }

  @Post('setChatFavorito')
  // @Auth()
  setChatFavorito(
    @Body() dtoIn: ChatFavoritoDto
  ) {
    return this.service.setChatFavorito(dtoIn);
  }

  @Post('getContactosLista')
  // @Auth()
  getContactosLista(
    @Body() dtoIn: ListaChatDto
  ) {
    return this.service.getContactosLista(dtoIn);
  }


  @Post('getTotalMensajes')
  // @Auth()
  getTotalMensajes(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getTotalMensajes(dtoIn);
  }

  @Post('findContacto')
  // @Auth()
  findContacto(
    @Body() dtoIn: FindChatDto
  ) {
    return this.service.findContacto(dtoIn);
  }

  @Post('findTextoMensajes')
  // @Auth()
  findTextoMensajes(
    @Body() dtoIn: FindChatDto
  ) {
    return this.service.findTextoMensajes(dtoIn);
  }

  // ----------------------------


  @Post('activarNumero')
  // @Auth()
  activarNumero(
    @Body() dtoIn: MensajeChatDto
  ) {
    return this.service.activarNumero(dtoIn);
  }


}
