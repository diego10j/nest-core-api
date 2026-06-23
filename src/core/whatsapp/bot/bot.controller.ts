import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { BotConfigService } from './bot-config.service';
import { BotSessionService } from './bot-session.service';
import { BotService } from './bot.service';
import { ToggleBotDto } from './dto/toggle-bot.dto';

@ApiTags('WhatsApp-Bot')
@Controller('whatsapp/bot')
export class BotController {
  constructor(
    private readonly botConfig: BotConfigService,
    private readonly botSession: BotSessionService,
    private readonly botService: BotService,
  ) { }

  @Post('toggle')
  @ApiOperation({ summary: 'Activar o desactivar el bot manualmente' })
  async toggle(@Body() dto: ToggleBotDto & HeaderParamsDto) {
    await this.botConfig.toggleManual(dto.ideWhcue, dto.activar, dto.ideUsua, dto.observacion);
    return { ok: true, activo: dto.activar };
  }

  @Get('status/:ideWhcue')
  @ApiOperation({ summary: 'Estado actual del bot y último registro de activación' })
  async status(@Param('ideWhcue', ParseIntPipe) ideWhcue: number) {
    return this.botConfig.getStatus(ideWhcue);
  }

  @Get('logs/:ideWhcue')
  @ApiOperation({ summary: 'Historial de activaciones del bot' })
  async logs(@Param('ideWhcue', ParseIntPipe) ideWhcue: number) {
    return this.botConfig.getLogs(ideWhcue);
  }

  @Post('liberar-chat/:ideWhcha')
  @ApiOperation({ summary: 'Agente libera un chat — el bot puede volver a responder' })
  async liberarChat(@Param('ideWhcha', ParseIntPipe) ideWhcha: number) {
    await this.botService.liberarChat(ideWhcha);
    return { ok: true, message: 'Chat liberado — el bot puede responder de nuevo' };
  }

  @Put('config/:ideWhcue')
  @ApiOperation({ summary: 'Actualizar nombre, prompt, template y parámetros del bot' })
  async updateConfig(
    @Param('ideWhcue', ParseIntPipe) ideWhcue: number,
    @Body() dto: {
      nombre_bot?: string;
      prompt_sistema?: string;
      template_saludo?: string;
      horario_atencion?: string;
      monto_envio_gratis?: number;
      max_intentos_fallo?: number;
    },
  ) {
    await this.botConfig.updateConfigBot(ideWhcue, dto);
    return { ok: true };
  }

  @Get('config/:ideWhcue')
  @ApiOperation({ summary: 'Obtener configuración actual del bot' })
  async getConfig(@Param('ideWhcue', ParseIntPipe) ideWhcue: number) {
    return this.botConfig.getConfig(ideWhcue);
  }
}
