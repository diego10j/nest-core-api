import { Body, Controller, Get, Logger, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { BotConfigService } from './bot-config.service';
import { BotSessionService } from './bot-session.service';
import { BotService } from './bot.service';
import { BotConfigQueryDto } from './dto/bot-config-query.dto';
import { BotSessionQueryDto } from './dto/bot-session-query.dto';
import { SaveBotConfigDto } from './dto/save-bot-config.dto';
import { ToggleBotDto } from './dto/toggle-bot.dto';

@ApiTags('WhatsApp-Bot')
@Controller('whatsapp/bot')
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(
    private readonly botConfig: BotConfigService,
    private readonly botSession: BotSessionService,
    private readonly botService: BotService,
  ) { }

  @Post('toggle')
  @ApiOperation({ summary: 'Activar o desactivar el bot manualmente' })
  async toggle(@Body() dto: ToggleBotDto & HeaderParamsDto) {
    await this.botConfig.toggleManual(dto.ideWhcue, dto.activar, dto.ideUsua, dto.observacion);
    if (dto.activar) {
      // Fire-and-forget: procesar chats con mensajes pendientes
      this.botService.procesarPendientesGlobal(dto.ideWhcue, dto.ideEmpr)
        .catch((err) => this.logger.error(`procesarPendientesGlobal error: ${err.message}`));
    }
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
    // Fire-and-forget: procesar mensajes pendientes de ese chat
    this.botService.procesarPendientesChat(ideWhcha)
      .catch((err) => this.logger.error(`procesarPendientesChat error chat=${ideWhcha}: ${err.message}`));
    return { ok: true, message: 'Chat liberado — el bot puede responder de nuevo' };
  }

  @Put('config/:ideWhcue')
  @ApiOperation({ summary: 'Actualizar nombre, prompt, template y parámetros del bot' })
  async updateConfig(
    @Param('ideWhcue', ParseIntPipe) ideWhcue: number,
    @Body() dto: {
      nombre_bot?: string;
      prompt_sistema?: string;
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

  @Get('configs')
  @ApiOperation({ summary: 'Listar todas las configuraciones de bot de la empresa (grilla admin)' })
  async getConfigs(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: BotConfigQueryDto,
  ) {
    return this.botConfig.getConfigs({ ...h, ...dto });
  }

  @Post('config')
  @ApiOperation({ summary: 'Crear o actualizar una configuración de bot para una cuenta' })
  async saveConfig(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SaveBotConfigDto,
  ) {
    await this.botConfig.saveConfig({ ...h, ...dto });
    return { ok: true };
  }

  @Get('cuentas-sin-config')
  @ApiOperation({ summary: 'Cuentas WhatsApp sin configuración de bot (dropdown)' })
  async getCuentasSinConfig(@AppHeaders() h: HeaderParamsDto) {
    return this.botConfig.getCuentasSinConfig(h.ideEmpr);
  }

  @Post('setActivoConfig')
  @ApiOperation({ summary: 'Activar/desactivar bot desde la grilla (por ide_whbco)' })
  async setActivoConfig(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: { ide: number; activo: boolean },
  ) {
    await this.botConfig.setActivoBotConfig(dto.ide, dto.activo, h.ideUsua);
    return { ok: true, activo: dto.activo };
  }

  @Get('logs')
  @ApiOperation({ summary: 'Historial global de activaciones del bot (todas las cuentas)' })
  async logsGlobal(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: BotConfigQueryDto,
  ) {
    return this.botConfig.getLogsGlobal({ ...h, ...dto });
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Listar sesiones activas del bot con datos del chat' })
  async sessions(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: BotSessionQueryDto,
  ) {
    return this.botSession.getSessions({ ...h, ...dto });
  }

  @Get('sessions/:ideWhcha')
  @ApiOperation({ summary: 'Historial de sesiones de un chat específico' })
  async sessionHistory(@Param('ideWhcha', ParseIntPipe) ideWhcha: number) {
    return this.botSession.getSessionHistory(ideWhcha);
  }
}
