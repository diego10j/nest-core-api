import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { ServiceDto } from 'src/common/dto/service.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ListaChatDto } from './dto/lista-chat.dto';
import { FindChatDto } from './dto/find-chat.dto';


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

  @Post('enviarMensajeTexto')
  // @Auth()
  enviarMensajeTexto(
    @Body() dtoIn: EnviarMensajeDto
  ) {
    return this.service.enviarMensajeTexto(dtoIn);
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



  @Post('enviarMensajeImagen')
  // @Auth()
  @UseInterceptors(FileInterceptor('file'))
  async enviarImagen(
    @UploadedFile() file: Express.Multer.File
  ) {
    return this.service.enviarMensajeImagen(file);
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
    @Body() dtoIn: GetMensajesDto
  ) {
    return this.service.setChatNoLeido(dtoIn);
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



  @Post('send/:to')
  async sendMessage(@Param('to') to: string, @Body() body: { type: string, content: any }) {
    return this.service.sendMessage(to, body.type, body.content);
  }

}
