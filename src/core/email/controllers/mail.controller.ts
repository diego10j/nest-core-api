import { Get, Controller, Post, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { GetMailQueueDto } from '../dto/get-mail-queue.dto';
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

  @Get('getCuentasCorreoActivas')
  @ApiOperation({ summary: 'Listar cuentas de correo activas de la empresa (sis_cuenta_correo)' })
  getCuentasCorreoActivas(@AppHeaders() h: HeaderParamsDto) {
    return this.mailService.getCuentasCorreoActivas(h.ideEmpr);
  }

  @Post('sendTest')
  @ApiOperation({ summary: 'Enviar correo de prueba para verificar configuración SMTP' })
  async sendTest(@AppHeaders() _headersParams: HeaderParamsDto) {
    return await this.testService.testMail('diego10j.89@hotmail.com');
  }

  @Get('getMailQueue')
  @ApiOperation({ summary: 'Listar todos los correos enviados desde sis_cola_correo (sin cuerpo)' })
  getMailQueue(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dtoIn: GetMailQueueDto,
  ) {
    return this.mailService.getMailQueue({ ...h, ...dtoIn });
  }

  @Get('getMailBody/:ideCoco')
  @ApiOperation({ summary: 'Obtener un correo de la cola con el cuerpo completo' })
  getMailBody(
    @AppHeaders() _h: HeaderParamsDto,
    @Param('ideCoco', ParseIntPipe) ideCoco: number,
  ) {
    return this.mailService.getMailBody(ideCoco);
  }

  @Get('getAdjuntosMail/:ideCoco')
  @ApiOperation({ summary: 'Listar adjuntos de un correo de la cola por ide_coco' })
  getAdjuntosMail(
    @AppHeaders() _h: HeaderParamsDto,
    @Param('ideCoco', ParseIntPipe) ideCoco: number,
  ) {
    return this.mailService.getAdjuntosMail(ideCoco);
  }
}
