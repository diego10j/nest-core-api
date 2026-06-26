import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SelectQuery } from 'src/core/connection/helpers';

import { YcloudMetricsService } from '../ycloud/ycloud-metrics.service';

import { BotConfigService } from './bot-config.service';

@Injectable()
export class BotScheduleService {
  private readonly logger = new Logger(BotScheduleService.name);

  constructor(
    private readonly botConfig: BotConfigService,
    private readonly metricsService: YcloudMetricsService,
  ) {}

  /**
   * Cada minuto evalúa si las cuentas deben activar o desactivar el bot por horario.
   * Solo actúa cuando detecta un cambio de estado (evita spam en el log).
   */
  @Cron('0 * * * * *')
  async evaluarHorarioBot(): Promise<void> {
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
