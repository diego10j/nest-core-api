import { Body, Controller, Post } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ActivarNumeroDto } from './dto/activar-numbero.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly service: ChatbotService) { }

  @Post('activarNumero')
  // @Auth()
  activarNumero(
    @Body() dtoIn: ActivarNumeroDto
  ) {
    return this.service.activarNumero(dtoIn);
  }
}
