import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { YcloudMetricsService } from '../ycloud/ycloud-metrics.service';

import { BotConfigService } from './bot-config.service';
import { BotDebounceService } from './bot-debounce.service';
import { BotSessionService } from './bot-session.service';
import { BotService } from './bot.service';

@Injectable()
export class BotScheduleService {
  private readonly logger = new Logger(BotScheduleService.name);

  // Cota inferior conservadora para candidatos del debounce de mensajes reducidos — el
  // corte real por cuenta (wha_bot_config.segundos_espera_whbco) se aplica después.
  private readonly MIN_ESPERA_REDUCIDO_SEG = 3;

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly botConfig: BotConfigService,
    private readonly metricsService: YcloudMetricsService,
    private readonly botService: BotService,
    private readonly botSession: BotSessionService,
    private readonly botDebounce: BotDebounceService,
  ) {}

  /**
   * Cada minuto evalúa si las cuentas deben activar o desactivar el bot por horario.
   * Solo actúa cuando detecta un cambio de estado (evita spam en el log).
   * Solo corre en producción (MODE=PROD) — en DEV el horario automático está deshabilitado.
   */
  @Cron('0 * * * * *')
  async evaluarHorarioBot(): Promise<void> {
    if (envs.mode !== 'PROD') return;
    try {
      const configs = await this.botConfig.getAllConfigsConHorario();
      for (const cfg of configs) {
        const enHorario = await this.botConfig.estaEnHorario(cfg.ide_tihor);
        await this.botConfig.setActivoPorHorario(cfg.ide_whcue, enHorario);
      }
    } catch (error) {
      this.logger.error(`Error en evaluarHorarioBot: ${error.message}`);
    }
  }

  /**
   * Cada minuto (a los 30s) busca sesiones de bot activas con más de 20 min sin respuesta
   * del cliente. Envía un mensaje de despedida y deriva el chat a modo ASESOR.
   */
  @Cron('30 * * * * *')
  async verificarInactividad(): Promise<void> {
    try {
      const ttl = BotSessionService.SESSION_TTL_MINUTES;
      const result = await this.dataSource.pool.query<{
        ide_whbse: number;
        ide_whcha: number;
        wa_id_whcha: string;
        phone_number_id_whcha: string;
        ide_whcue: number;
        ide_empr: number;
        nombre_bot: string;
      }>(`
        SELECT s.ide_whbse, c.ide_whcha, c.wa_id_whcha, c.phone_number_id_whcha,
               cu.ide_whcue, cu.ide_empr,
               COALESCE(bc.nombre_bot, 'QuimIA') AS nombre_bot
        FROM wha_bot_sesion s
        INNER JOIN wha_chat c ON c.ide_whcha = s.ide_whcha
        INNER JOIN wha_cuenta cu ON cu.ide_whcue = s.ide_whcue AND cu.activo_whcue = TRUE
        LEFT JOIN wha_bot_config bc ON bc.ide_whcue = s.ide_whcue
        WHERE s.activa = TRUE
          AND s.estado = ANY('{ATENCION_LIBRE,PREGUNTA_ES_CLIENTE,IDENTIFICACION,
                               DATOS_NUEVO_CLIENTE,SELECCION_PRODUCTOS,SELECCION_MULTIPLE,
                               CONFIRMANDO_PRODUCTO_LOTE,
                               ESPERANDO_CANTIDAD_LOTE,ESPERANDO_USO_LOTE,
                               CONFIRMACION_PRODUCTOS,MODIFICANDO_LISTA,DATOS_ENVIO,DATOS_PAGO}'::text[])
          AND (NOW() - s.hora_actua) > make_interval(mins => $1)
          AND c.bot_activo_whcha = TRUE
          AND c.bot_modo_whcha = 'BOT'
          AND c.eliminado_whcha = FALSE
      `, [ttl]);

      for (const row of result.rows) {
        try {
          await this.botSession.expirarPorInactividad(row.ide_whbse);
          await this.botService.derivarAsesor(
            row.wa_id_whcha, row.phone_number_id_whcha,
            row.ide_whcha, row.ide_whcue, row.ide_empr,
            `Tu sesión ha finalizado por inactividad ⏳\n\nTe estamos comunicando con uno de nuestros asesores comerciales para dar seguimiento a tu consulta 👤\n\n_En breve te atenderán_ 😊\n\n⏰ *Horario de atención:* Lunes a viernes de 08:00 a 17:00 y sábados de 09:00 a 13:00. Fuera de este horario te responderemos el próximo día hábil. ¡Gracias!`,
            `Chat derivado a asesor por inactividad de ${ttl} min.`,
          );
          this.logger.log(`[Bot] Inactividad: chat=${row.ide_whcha} → ASESOR`);
        } catch (err) {
          this.logger.error(`[Bot] Inactividad chat=${row.ide_whcha}: ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`[Bot] verificarInactividad: ${err.message}`);
    }
  }

  /**
   * Cada 5s revisa el buffer de mensajes del modo mensajes reducidos (wha_bot_config.
   * reduce_mensajes_whbco) — cuando un chat lleva `segundos_espera_whbco` sin mensajes
   * nuevos, procesa de una sola vez todo lo acumulado en vez de responder mensaje a
   * mensaje. Ver BotDebounceService para el detalle del buffer.
   */
  @Cron('*/5 * * * * *')
  async procesarBufferReducido(): Promise<void> {
    try {
      const candidatos = await this.botDebounce.obtenerCandidatos(this.MIN_ESPERA_REDUCIDO_SEG);
      for (const { ideWhcha, ultimoMensajeMs } of candidatos) {
        try {
          const info = (await this.dataSource.pool.query<{
            ide_whcue: number; wa_id_whcha: string; phone_number_id_whcha: string;
            ide_empr: number; bot_activo_whcha: boolean; bot_modo_whcha: string;
          }>(`
            SELECT s.ide_whcue, c.wa_id_whcha, c.phone_number_id_whcha, cu.ide_empr,
                   c.bot_activo_whcha, c.bot_modo_whcha
            FROM wha_bot_sesion s
            INNER JOIN wha_chat c ON c.ide_whcha = s.ide_whcha
            INNER JOIN wha_cuenta cu ON cu.ide_whcue = s.ide_whcue
            WHERE s.ide_whcha = $1 AND s.activa = TRUE
            LIMIT 1
          `, [ideWhcha])).rows[0];

          if (!info) { await this.botDebounce.descartar(ideWhcha); continue; }

          if (!info.bot_activo_whcha || info.bot_modo_whcha !== 'BOT') {
            // Un asesor tomó el chat mientras esperaba el debounce — descartar sin responder.
            await this.botDebounce.descartar(ideWhcha);
            continue;
          }

          const config = await this.botConfig.getConfig(info.ide_whcue);
          const esperaMs = (config?.segundos_espera_whbco ?? 10) * 1000;
          if (Date.now() - ultimoMensajeMs < esperaMs) continue; // aún no le toca a esta cuenta

          const textos = await this.botDebounce.reclamarBuffer(ideWhcha);
          if (!textos.length) continue; // otro tick ya lo procesó

          await this.botService.procesarBufferReducido(
            info.wa_id_whcha, info.phone_number_id_whcha, ideWhcha,
            info.ide_whcue, info.ide_empr, textos.join('\n'),
          );
        } catch (err) {
          this.logger.error(`[Bot][Reducido] Error procesando buffer chat=${ideWhcha}: ${err.message}`, err.stack);
        }
      }
    } catch (error) {
      this.logger.error(`Error en procesarBufferReducido: ${error.message}`);
    }
  }

  /**
   * Diariamente a las 00:05 genera métricas del día anterior para todas las empresas
   * con WhatsApp activo. Así la tabla wha_metrics_diaria se mantiene poblada
   * automáticamente sin intervención manual.
   */
  @Cron('5 0 * * *')
  async generarMetricasDiarias(): Promise<void> {
    this.logger.log('[Metrics] Cron generarMetricasDiarias disparado');
    try {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      const fechaAyer = ayer.toISOString().split('T')[0];

      const empresas = await this.metricsService.dataSource.createSelectQuery(
        new SelectQuery(`
          SELECT DISTINCT ide_empr
          FROM wha_cuenta
          WHERE activo_whcue = TRUE
        `),
      );

      if (!empresas.length) {
        this.logger.warn('[Metrics] No hay empresas con WhatsApp activo (wha_cuenta.activo_whcue) — nada que generar');
        return;
      }

      let ok = 0;
      for (const { ide_empr } of empresas) {
        try {
          await this.metricsService.generateDailyMetrics(ide_empr as number, fechaAyer);
          ok++;
        } catch (err) {
          // No dejar que una empresa con error bloquee a las demás.
          this.logger.error(`[Metrics] Error generando métricas ide_empr=${ide_empr} fecha=${fechaAyer}: ${err.message}`, err.stack);
        }
      }

      this.logger.log(`[Metrics] Métricas diarias generadas para ${ok}/${empresas.length} empresa(s) — fecha: ${fechaAyer}`);
    } catch (error) {
      this.logger.error(`Error en generarMetricasDiarias: ${error.message}`, error.stack);
    }
  }
}
