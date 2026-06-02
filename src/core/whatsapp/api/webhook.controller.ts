import { Body, Controller, Get, HttpException, HttpStatus, Logger, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';

import { WhatsappApiService } from './whatsapp-api.service';

@ApiTags('WhatsApp-Webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly whatsappApiService: WhatsappApiService) {}

  @Get()
  @ApiOperation({ summary: 'Verificar token de webhook de WhatsApp (Meta)' })
  verifyWebhook(
    @AppHeaders() _h: HeaderParamsDto,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') verifyToken: string,
  ) {
    const token = envs.whatsappVerifyToken;
    if (verifyToken === token) {
      this.logger.log('Webhook verification successful');
      return challenge;
    }
    this.logger.warn('Webhook verification failed');
    throw new HttpException('Verification token mismatch', HttpStatus.FORBIDDEN);
  }

  @Post()
  @ApiOperation({ summary: 'Recibir eventos de webhook de WhatsApp (mensajes entrantes)' })
  async handleWebhook(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() body: any,
    @Res() res: any,
  ) {
    this.logger.log(`Webhook received: ${JSON.stringify(body, null, 2)}`);
    res.status(HttpStatus.OK).send({ status: 'EVENT_RECEIVED' });
    try {
      await this.whatsappApiService.saveReceivedMessage(body);
    } catch (error) {
      this.logger.error(`Error manejando webhook: ${error.message}`);
    }
  }
}
