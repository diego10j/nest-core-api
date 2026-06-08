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
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';

import { YcloudService } from './ycloud.service';

@ApiTags('YCloud-Webhook')
@Controller('webhook/ycloud')
export class YcloudWebhookController {
  private readonly logger = new Logger(YcloudWebhookController.name);

  constructor(private readonly ycloudService: YcloudService) {}

  @Get()
  @ApiOperation({ summary: 'Verificar token de webhook de YCloud' })
  verifyWebhook(
    @AppHeaders() _h: HeaderParamsDto,
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
  async handleWebhook(@AppHeaders() _h: HeaderParamsDto, @Body() body: any, @Res() res: any) {
    this.logger.log(`YCloud webhook received: ${JSON.stringify(body)}`);
    res.status(HttpStatus.OK).send({ status: 'ok' });
    try {
      await this.ycloudService.handleWebhook(body);
    } catch (error) {
      this.logger.error(`Error procesando webhook YCloud: ${error.message}`, error.stack);
    }
  }
}
