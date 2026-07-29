import { Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ComprobanteEnvioService } from './comprobante-envio.service';

interface SriEnvioJob {
  claveAcceso: string;
  dtoIn: HeaderParamsDto;
}

/**
 * Cola en memoria (sin dependencia externa) para recibir comprobantes a enviar al SRI bajo demanda:
 * los módulos de negocio (facturas, retención CxP, liquidación de compra) encolan aquí justo después
 * de crear la cabecera "sri_comprobante" en estado PENDIENTE, en vez de esperar bloqueados a que
 * termine la firma + el viaje de red al SRI dentro de su propia transacción de guardado.
 *
 * Fase 1 (actual): solo envío por demanda al encolar. Fase 2 (pendiente, fuera de esta pasada):
 * cron de reintentos periódicos para comprobantes que quedaron PENDIENTE/RECIBIDA sin completarse
 * (ej. por caída del proceso con jobs en cola, o error transitorio del SRI).
 */
@Injectable()
export class SriEnvioQueueService {
  private readonly logger = new Logger(SriEnvioQueueService.name);
  private readonly concurrencia = 2;
  private readonly jobs: SriEnvioJob[] = [];
  private activos = 0;

  constructor(private readonly comprobanteEnvioService: ComprobanteEnvioService) { }

  /** Encola el envío completo (firma + recepción + autorización) de un comprobante. No bloquea al llamante. */
  encolar(claveAcceso: string, dtoIn: HeaderParamsDto): void {
    this.jobs.push({ claveAcceso, dtoIn });
    this.tick();
  }

  /** Jobs en espera + en ejecución (útil para health checks / tests). */
  get pendientes(): number {
    return this.jobs.length + this.activos;
  }

  private tick(): void {
    while (this.activos < this.concurrencia && this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (!job) break;
      this.activos++;
      this.comprobanteEnvioService
        .enviarComprobante(job.claveAcceso, job.dtoIn)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Error al enviar comprobante ${job.claveAcceso} al SRI: ${msg}`);
        })
        .finally(() => {
          this.activos--;
          this.tick();
        });
    }
  }
}
