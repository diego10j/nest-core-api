import { Get, Controller, Post, Body, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { SendMailDto } from '../dto/send-mail.dto';
import { MailService } from '../services/mail.service';
import { TestMailService } from '../services/test-mail.service';

@ApiTags('Email-Mail')
@Controller('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly testService: TestMailService,
  ) { }

  @Post('send')
  @ApiOperation({ summary: 'Enviar correo electrónico' })
  // @Auth()
  async enviarMensajeTexto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SendMailDto) {
    return await this.mailService.sendMail(dtoIn, headersParams.ideEmpr, headersParams.login);
  }

  @Post('process-queue')
  @ApiOperation({ summary: 'Procesar la cola de correos pendientes' })
  // @Auth()
  async processQueue(@AppHeaders() _headersParams: HeaderParamsDto) {
    return await this.mailService.processMailQueue();
  }

  @Get('getCuentasCorreo')
  @ApiOperation({ summary: 'Listar cuentas de correo configuradas para la empresa' })
  // @Auth()
  getCuentasCorreo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.mailService.getCuentasCorreo(headersParams);
  }

  @Get('getCuentaCorreoPorDefecto')
  @ApiOperation({ summary: 'Obtener la cuenta de correo configurada como predeterminada' })
  // @Auth()
  async getCuentaCorreoPorDefecto(@AppHeaders() headersParams: HeaderParamsDto) {
    return await this.mailService.getCuentaCorreoPorDefecto(headersParams);
  }

  @Post('sendTest')
  @ApiOperation({ summary: 'Enviar correo de prueba para verificar configuración SMTP' })
  async sendTest(@AppHeaders() _headersParams: HeaderParamsDto) {
    return await this.testService.testMail('diego10j.89@hotmail.com');
  }
}
