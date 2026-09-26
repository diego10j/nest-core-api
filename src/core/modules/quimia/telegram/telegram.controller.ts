import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Public } from 'src/core/auth/decorators/public.decorator';

import {
  IdeComandoTelegramDto,
  ProbarReporteDto,
  SaveComandoTelegramDto,
  SetActivoComandoTelegramDto,
} from './dto/comando-telegram.dto';
import { IdeCuentaTelegramDto, IdeUsuarioTelegramDto, SetActivoUsuarioTelegramDto } from './dto/ide-telegram.dto';
import { SaveCuentaTelegramDto } from './dto/save-cuenta-telegram.dto';
import { SaveUsuarioTelegramDto } from './dto/save-usuario-telegram.dto';
import { TelegramAlertasService } from './telegram-alertas.service';
import { TelegramUpdate } from './telegram-api.service';
import { TelegramComandosService } from './telegram-comandos.service';
import { TelegramCuentaService } from './telegram-cuenta.service';
import { TelegramRunnerService } from './telegram-runner.service';

@ApiTags('QuimIA-Telegram')
@Controller('quimia/telegram')
export class TelegramController {
  constructor(
    private readonly cuentas: TelegramCuentaService,
    private readonly runner: TelegramRunnerService,
    private readonly alertas: TelegramAlertasService,
    private readonly comandos: TelegramComandosService,
  ) {}

  // ------------------------------------------------------------------ comandos (/ventas, /resumen…)

  @Get('getCatalogoReportes')
  @ApiOperation({ summary: 'Reportes disponibles para asignar a un comando (con sus parámetros)' })
  getCatalogoReportes() {
    return { rows: this.comandos.catalogo() };
  }

  @Get('getComandos')
  @ApiOperation({ summary: 'Comandos configurados del bot' })
  getComandos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeCuentaTelegramDto) {
    return this.comandos.listar(dtoIn.ide_tlcue, headersParams.ideEmpr);
  }

  @Post('saveComando')
  @ApiOperation({ summary: 'Crear/editar un comando (actualiza el menú "/" de los números habilitados)' })
  saveComando(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveComandoTelegramDto) {
    // Solo los números con "Puede usar comandos" los ven y usan (se configura en Números autorizados).
    return this.comandos.guardar(dtoIn, headersParams);
  }

  @Post('setActivoComando')
  @ApiOperation({ summary: 'Activar/desactivar un comando' })
  setActivoComando(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SetActivoComandoTelegramDto) {
    return this.comandos.setActivo(dtoIn.ide_qmcom, dtoIn.activo, headersParams);
  }

  @Post('deleteComando')
  @ApiOperation({ summary: 'Eliminar un comando' })
  deleteComando(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeComandoTelegramDto) {
    return this.comandos.eliminar(dtoIn.ide_qmcom, headersParams);
  }

  @Post('probarReporte')
  @ApiOperation({ summary: 'Vista previa del reporte de un comando (bloques: indicadores, gráfico y tablas)' })
  probarReporte(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ProbarReporteDto) {
    return this.comandos.probar(dtoIn.reporte, dtoIn.parametros ?? {}, headersParams, dtoIn.ide_tlcue);
  }


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
  async saveUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveUsuarioTelegramDto) {
    const r = await this.cuentas.saveUsuario({ ...headersParams, ...dtoIn });
    // "Puede usar comandos" cambia su menú "/" en Telegram.
    this.comandos.sincronizarMenus(dtoIn.ide_tlcue, r.ide_tlusu).catch(() => undefined);
    return r;
  }

  @Post('setActivoUsuario')
  @ApiOperation({ summary: 'Activar/desactivar un número (opcionalmente desvincula su chat)' })
  setActivoUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SetActivoUsuarioTelegramDto) {
    return this.cuentas.setActivoUsuario({ ...headersParams, ...dtoIn });
  }

  @Post('probarAlerta')
  @ApiOperation({ summary: 'Envía una alerta de prueba a los números con "Recibe alertas del sistema"' })
  async probarAlerta(@AppHeaders() headersParams: HeaderParamsDto) {
    const enviados = await this.alertas.enviar({
      ideEmpr: headersParams.ideEmpr,
      codigo: 'PRUEBA',
      titulo: '🔔 Prueba de alerta',
      mensaje: `Este número recibirá las alertas del sistema del ERP (ej. OpenAI sin saldo). Enviada por ${headersParams.login}.`,
      nivel: 'INFO',
    });
    return { enviados };
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
