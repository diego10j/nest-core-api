import { Controller, Get, Post, Body, Query, Res, HttpStatus, Logger } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';

@Controller('webhook')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(private readonly chatbotService: ChatbotService) {}

    @Get()
    verifyWebhook(@Query('hub.challenge') challenge: string, @Query('hub.verify_token') verifyToken: string, @Res() res: any) {
        const token = process.env.WHATSAPP_VERIFY_TOKEN;
        if (verifyToken === token) {
            this.logger.log('Webhook verification successful');
            res.status(HttpStatus.OK).send(challenge);
        } else {
            this.logger.warn('Webhook verification failed');
            res.status(HttpStatus.FORBIDDEN).send('Verification token mismatch');
        }
    }

    @Post()
    async handleWebhook(@Body() body: any, @Res() res: any) {
        this.logger.log(`Webhook received: ${JSON.stringify(body)}`);
        try {
            await this.chatbotService.manejarMensajeEntrante(body);
            res.status(HttpStatus.OK).send('EVENT_RECEIVED');
        } catch (error) {
            this.logger.error(`Error handling webhook: ${error.message}`);
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('ERROR');
        }
    }
}
