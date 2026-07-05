import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { envs } from 'src/config/envs';

import { YcloudService } from './ycloud.service';

@ApiTags('YCloud-Webhook')
@Controller('webhook/ycloud')
export class YcloudWebhookController {
  private readonly logger = new Logger(YcloudWebhookController.name);

  constructor(private readonly ycloudService: YcloudService) { }

  @Get()
  @ApiOperation({ summary: 'Verificar token de webhook de YCloud' })
  verifyWebhook(
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
  ) {
    const token = envs.ycloudWebhookVerifyToken;
    if (verifyToken === token) {
      this.logger.log('YCloud webhook verification successful');
      return challenge;
    }
    this.logger.warn('YCloud webhook verification failed: token mismatch');
    throw new HttpException('Verification token mismatch', HttpStatus.FORBIDDEN);
  }

  @Post()
  @ApiOperation({ summary: 'Recibir eventos de webhook de YCloud' })
  async handleWebhook(@Body() body: any, @Res() res: any) {
    res.status(HttpStatus.OK).send({ status: 'ok' });
    // Log de recepción a nivel de controller: permite distinguir "el webhook nunca
    // llegó a este servidor" (línea ausente) de "llegó pero se perdió procesándolo"
    // (línea presente sin efectos) — clave cuando hay más de un endpoint registrado
    // en YCloud o un túnel inestable en DEV.
    this.logger.debug(`[Webhook] ${body?.type ?? 'sin type'} | wamid=${body?.whatsappInboundMessage?.wamid ?? body?.whatsappMessage?.wamid ?? 'N/A'}`);
    try {
      await this.ycloudService.handleWebhook(body);
    } catch (error) {
      this.logger.error(`Error procesando webhook YCloud: ${error.message}`, error.stack);
    }
  }
}
