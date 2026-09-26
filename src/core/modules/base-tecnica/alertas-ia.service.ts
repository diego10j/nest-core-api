import { Injectable, Logger } from '@nestjs/common';

import { AlertaSistemaEmitter } from '../sistema/notificaciones/alerta-sistema.emitter';
import { NotificacionesService } from '../sistema/notificaciones/notificaciones.service';

import { ProblemaCuentaIa, problemaCuentaIa } from './helpers/errores-ia.helper';

/** Un mismo problema se avisa como máximo una vez en este lapso (la extracción puede fallar en ráfaga). */
const INTERVALO_AVISO_MS = 30 * 60 * 1000;

/** Código de plantilla en Notificaciones (campana del ERP): crear la plantilla y asignar usuarios. */
export const CODIGO_NOTIFICACION_IA = 'IA_SIN_SALDO';

/**
 * Avisa a los administradores cuando la cuenta de OpenAI no puede atender (sin saldo, límite de
 * gasto o API key inválida): campana del ERP (plantilla IA_SIN_SALDO) y Telegram (números con
 * "Recibe alertas del sistema").
 */
@Injectable()
export class AlertasIaService {
  private readonly logger = new Logger(AlertasIaService.name);
  private readonly ultimoAviso = new Map<string, number>();

  constructor(
    private readonly notificaciones: NotificacionesService,
    private readonly alertas: AlertaSistemaEmitter,
  ) {}

  /**
   * Si el error es de la cuenta de OpenAI, avisa (con límite de frecuencia) y devuelve el problema;
   * si es cualquier otro error devuelve null sin hacer nada.
   */
  reportar(error: unknown, contexto: { ideEmpr: number; origen: string }): ProblemaCuentaIa | null {
    const problema = problemaCuentaIa(error);
    if (!problema) return null;

    const clave = `${problema}:${contexto.ideEmpr}`;
    const ahora = Date.now();
    if (ahora - (this.ultimoAviso.get(clave) ?? 0) < INTERVALO_AVISO_MS) return problema;
    this.ultimoAviso.set(clave, ahora);

    const titulo = problema === 'SIN_SALDO' ? '⚠️ OpenAI sin saldo' : '⚠️ API key de OpenAI inválida';
    const mensaje =
      problema === 'SIN_SALDO'
        ? `La cuenta de OpenAI no tiene saldo o alcanzó su límite de gasto. QuimIA y la extracción de la base ` +
          `técnica están detenidas (${contexto.origen}). Recarga en platform.openai.com → Billing; la extracción ` +
          `masiva quedó en pausa y se reanuda desde Base Técnica.`
        : `OpenAI rechazó la API key configurada en el servidor (${contexto.origen}). Revisa OPENAI_API_KEY.`;
    this.logger.error(`${titulo}: ${(error as Error)?.message ?? error}`);

    this.notificaciones
      .enviarSistema(CODIGO_NOTIFICACION_IA, titulo, mensaje, { problema, origen: contexto.origen }, contexto.ideEmpr)
      .catch((e) => this.logger.warn(`No se pudo registrar la notificación: ${(e as Error).message}`));
    this.alertas.emitir({ ideEmpr: contexto.ideEmpr, codigo: CODIGO_NOTIFICACION_IA, titulo, mensaje, nivel: 'CRITICA' });
    return problema;
  }
}
