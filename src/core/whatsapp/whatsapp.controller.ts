import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MensajeChatDto } from './dto/mensaje-chat.dto';
import { GetMensajesDto } from './dto/get-mensajes.dto';
import { ServiceDto } from 'src/common/dto/service.dto';
import { EnviarMensajeDto } from './dto/enviar-mensaje.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ListaDto } from './dto/lista.dto';


@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly service: WhatsappService) { }


  @Post('getChats')
  // @Auth()
  async getChats(dto: ServiceDto) {
    return this.service.getChats(dto);
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

  @Post('getContactosLista')
  // @Auth()
  getContactosLista(
    @Body() dtoIn: ListaDto
  ) {
    return this.service.getContactosLista(dtoIn);
  }

  

  @Post('enviarMensajeTexto')
  // @Auth()
  enviarMensajeTexto(
    @Body() dtoIn: EnviarMensajeDto
  ) {
    return this.service.enviarMensajeTexto(dtoIn);
  }

  @Post('getProfilePictureUrl')
  // @Auth()
  getProfilePictureUrl(
    @Body() dtoIn: EnviarMensajeDto
  ) {
    return this.service.getProfilePictureUrl(dtoIn);
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


  // ----------------------------


  @Post('activarNumero')
  // @Auth()
  activarNumero(
    @Body() dtoIn: MensajeChatDto
  ) {
    return this.service.activarNumero(dtoIn);
  }



  @Patch('mark-read/:id')
  async markMessageAsRead(@Param('id') id: string) {
    return this.service.markMessageAsRead(id);
  }

  @Patch('mark-pending/:id')
  async markMessageAsPending(@Param('id') id: string) {
    return this.service.markMessageAsPending(id);
  }

  @Post('send/:to')
  async sendMessage(@Param('to') to: string, @Body() body: { type: string, content: any }) {
    return this.service.sendMessage(to, body.type, body.content);
  }

}
