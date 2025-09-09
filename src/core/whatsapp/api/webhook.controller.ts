import { Controller, Get, Post, Body, Query, HttpException, HttpStatus, Logger, Res } from '@nestjs/common';
import { envs } from 'src/config/envs';

import { WhatsappApiService } from './whatsapp-api.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly whatsappApiService: WhatsappApiService) {}

  @Get()
  verifyWebhook(@Query('hub.challenge') challenge: string, @Query('hub.verify_token') verifyToken: string) {
    const token = envs.whatsappVerifyToken; // Debe ser el mismo que configuraste en Meta
    if (verifyToken === token) {
      this.logger.log('Webhook verification successful');
      return challenge;
    }
    this.logger.warn('Webhook verification failed');
    throw new HttpException('Verification token mismatch', HttpStatus.FORBIDDEN);
  }

  @Post()
  async handleWebhook(@Body() body: any, @Res() res: any) {
    this.logger.log(`Webhook received: ${JSON.stringify(body, null, 2)}`);
    // Responde inmediatamente a Meta para evitar reintentos
    res.status(HttpStatus.OK).send({ status: 'EVENT_RECEIVED' });
    // Procesa el mensaje en segundo plano
    try {
      await this.whatsappApiService.saveReceivedMessage(body);
    } catch (error) {
      this.logger.error(`❌ Error manejando webhook: ${error.message}`);
    }
  }
}
