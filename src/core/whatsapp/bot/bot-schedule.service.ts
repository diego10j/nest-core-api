import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { BotConfigService } from './bot-config.service';

@Injectable()
export class BotScheduleService {
  private readonly logger = new Logger(BotScheduleService.name);

  constructor(private readonly botConfig: BotConfigService) {}

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
}
