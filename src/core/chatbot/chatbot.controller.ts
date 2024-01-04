import { Body, Controller, Post } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { MensajeChatDto } from './dto/mensaje-chat.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly service: ChatbotService) { }

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
  
}
