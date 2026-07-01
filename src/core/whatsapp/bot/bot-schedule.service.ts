import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { YcloudMetricsService } from '../ycloud/ycloud-metrics.service';

import { BotConfigService } from './bot-config.service';
import { BotSessionService } from './bot-session.service';
import { BotService } from './bot.service';

@Injectable()
export class BotScheduleService {
  private readonly logger = new Logger(BotScheduleService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly botConfig: BotConfigService,
    private readonly metricsService: YcloudMetricsService,
    private readonly botService: BotService,
    private readonly botSession: BotSessionService,
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
                               ESPERANDO_CANTIDAD,CONFIRMACION_PRODUCTOS,DATOS_ENVIO,DATOS_PAGO}'::text[])
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
            `Tu sesión ha finalizado por inactividad ⏳\n\nTe estamos comunicando con uno de nuestros asesores comerciales para dar seguimiento a tu consulta 👤\n\n_En breve te atenderán_ 😊`,
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
   * Diariamente a las 00:05 genera métricas del día anterior para todas las empresas
   * con WhatsApp activo. Así la tabla wha_metrics_diaria se mantiene poblada
   * automáticamente sin intervención manual.
   */
  @Cron('5 0 * * *')
  async generarMetricasDiarias(): Promise<void> {
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
        this.logger.warn('No hay empresas con WhatsApp activo para generar métricas');
        return;
      }

      for (const { ide_empr } of empresas) {
        await this.metricsService.generateDailyMetrics(ide_empr as number, fechaAyer);
      }

      this.logger.log(`Métricas diarias generadas para ${empresas.length} empresa(s) — fecha: ${fechaAyer}`);
    } catch (error) {
      this.logger.error(`Error en generarMetricasDiarias: ${error.message}`);
    }
  }
}
