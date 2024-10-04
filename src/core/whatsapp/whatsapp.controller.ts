import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { MensajeChatDto } from './dto/mensaje-chat.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly service: WhatsappService) { }

  @Post('activarNumero')
  // @Auth()
  activarNumero(
    @Body() dtoIn: MensajeChatDto
  ) {
    return this.service.activarNumero(dtoIn);
  }

  @Post('enviarMensaje')
  // @Auth()
  enviarMensaje(
    @Body() dtoIn: MensajeChatDto
  ) {
    return this.service.enviarMensaje(dtoIn);
  }


  @Get('messages')
  async getMessages() {
    return this.service.getMessages();
  }

  @Get('messages/:phone')
  async getMessagesByPhone(@Param('phone') phone: string) {
    return this.service.getMessagesByPhone(phone);
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
