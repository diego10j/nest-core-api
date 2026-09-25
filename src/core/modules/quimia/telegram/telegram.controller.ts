import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Public } from 'src/core/auth/decorators/public.decorator';

import { IdeCuentaTelegramDto, IdeUsuarioTelegramDto, SetActivoUsuarioTelegramDto } from './dto/ide-telegram.dto';
import { SaveCuentaTelegramDto } from './dto/save-cuenta-telegram.dto';
import { SaveUsuarioTelegramDto } from './dto/save-usuario-telegram.dto';
import { TelegramUpdate } from './telegram-api.service';
import { TelegramCuentaService } from './telegram-cuenta.service';
import { TelegramRunnerService } from './telegram-runner.service';

@ApiTags('QuimIA-Telegram')
@Controller('quimia/telegram')
export class TelegramController {
  constructor(
    private readonly cuentas: TelegramCuentaService,
    private readonly runner: TelegramRunnerService,
  ) {}

  // ------------------------------------------------------------------ administración

  @Get('getCuenta')
  @ApiOperation({ summary: 'Cuenta del bot de Telegram (token enmascarado)' })
  getCuenta(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.cuentas.getCuenta(headersParams);
  }

  @Post('saveCuenta')
  @ApiOperation({ summary: 'Crear/actualizar la cuenta del bot (valida el token con Telegram y aplica el modo)' })
  saveCuenta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCuentaTelegramDto) {
    return this.cuentas.saveCuenta({ ...headersParams, ...dtoIn });
  }

  @Post('probarConexion')
  @ApiOperation({ summary: 'Verifica el token y el estado del webhook en Telegram' })
  probarConexion(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeCuentaTelegramDto) {
    return this.cuentas.probarConexion(dtoIn.ide_tlcue, headersParams.ideEmpr);
  }

  @Get('getUsuarios')
  @ApiOperation({ summary: 'Números autorizados a usar el bot' })
  getUsuarios(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeCuentaTelegramDto) {
    return this.cuentas.getUsuarios(dtoIn.ide_tlcue, headersParams.ideEmpr);
  }

  @Post('saveUsuario')
  @ApiOperation({ summary: 'Agregar/editar un número autorizado' })
  saveUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveUsuarioTelegramDto) {
    return this.cuentas.saveUsuario({ ...headersParams, ...dtoIn });
  }

  @Post('setActivoUsuario')
  @ApiOperation({ summary: 'Activar/desactivar un número (opcionalmente desvincula su chat)' })
  setActivoUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SetActivoUsuarioTelegramDto) {
    return this.cuentas.setActivoUsuario({ ...headersParams, ...dtoIn });
  }

  @Post('deleteUsuario')
  @ApiOperation({ summary: 'Eliminar un número autorizado' })
  deleteUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeUsuarioTelegramDto) {
    return this.cuentas.deleteUsuario({ ...headersParams, ...dtoIn });
  }

  @Get('getConsultas')
  @ApiOperation({ summary: 'Últimas preguntas recibidas por Telegram' })
  getConsultas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeCuentaTelegramDto) {
    return this.cuentas.getConsultas(dtoIn.ide_tlcue, headersParams.ideEmpr);
  }

  // ------------------------------------------------------------------ webhook (lo llama Telegram)

  @Public()
  @SkipThrottle()
  @Post('webhook/:ide_tlcue')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Param('ide_tlcue', ParseIntPipe) ideTlcue: number,
    @Headers('x-telegram-bot-api-secret-token') secreto: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    // Siempre 200: si se respondiera error, Telegram reintentaría el mismo update indefinidamente.
    await this.runner.recibirWebhook(ideTlcue, secreto, update);
    return { ok: true };
  }
}
