import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ArchivoSubidoEmitter, ArchivoSubidoEvent } from '../sistema/files/archivo-subido.emitter';

import { BdtProcesoService, DetalleArchivo, nuevosContadores } from './bdt-proceso.service';
import { CuentaIaError } from './helpers/errores-ia.helper';

/** Espera tras el último archivo de un producto: una subida de varios archivos se procesa junta. */
const ESPERA_AGRUPAR_MS = 10_000;

export interface ConfiguracionBdt {
  auto_activo_bdcfg: boolean;
  /** Tope de gasto diario de la extracción automática (USD); null = sin tope. */
  tope_diario_usd_bdcfg: number | null;
}

const CONFIG_DEFECTO: ConfiguracionBdt = { auto_activo_bdcfg: true, tope_diario_usd_bdcfg: 1 };

/**
 * Extracción automática: al subir (o mover a la carpeta de un producto) un PDF/imagen, FilesService
 * avisa por ArchivoSubidoEmitter y aquí se extraen los pendientes de ese producto en segundo plano.
 * No hay tarea periódica: solo reacciona a subidas. Lo que no alcance (servidor reiniciado, tope
 * diario) queda pendiente para el botón "Procesar pendientes".
 */
@Injectable()
export class BdtAutomaticoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BdtAutomaticoService.name);
  private readonly programados = new Map<string, NodeJS.Timeout>();
  /** Cola: un producto a la vez (el masivo corre aparte; el candado por archivo evita duplicados). */
  private cola: Promise<void> = Promise.resolve();
  private readonly oyente = (e: ArchivoSubidoEvent) => {
    this.alArchivo(e).catch((err) => this.logger.warn(`Archivo ${e.uuid}: ${(err as Error).message}`));
  };

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proceso: BdtProcesoService,
    private readonly archivoSubido: ArchivoSubidoEmitter,
  ) {}

  onModuleInit() {
    this.archivoSubido.on('archivo', this.oyente);
  }

  onModuleDestroy() {
    this.archivoSubido.off('archivo', this.oyente);
    this.programados.forEach((t) => clearTimeout(t));
  }

  private async alArchivo(e: ArchivoSubidoEvent) {
    const ideInarti = await this.proceso.productoDeArchivo(e.uuid, e.ideEmpr);
    if (!ideInarti) return; // no es un adjunto de producto
    const clave = `${e.ideEmpr}:${ideInarti}`;
    clearTimeout(this.programados.get(clave));
    this.programados.set(
      clave,
      setTimeout(() => {
        this.programados.delete(clave);
        this.cola = this.cola
          .then(() => this.procesar(e.ideEmpr, ideInarti))
          .catch((err) => this.logger.error(`Extracción automática ${clave}: ${(err as Error).message}`, (err as Error).stack));
      }, ESPERA_AGRUPAR_MS),
    );
  }

  private async procesar(ideEmpr: number, ideInarti: number) {
    const cfg = await this.getConfiguracion(ideEmpr);
    if (!cfg.auto_activo_bdcfg) return;
    const pendientes = await this.proceso.listarPendientes(ideEmpr, ideInarti);
    if (!pendientes.length) return;

    if (cfg.tope_diario_usd_bdcfg != null) {
      const gasto = await this.gastoAutomaticoHoy(ideEmpr);
      if (gasto >= Number(cfg.tope_diario_usd_bdcfg)) {
        this.logger.warn(
          `Tope diario de extracción automática alcanzado ($${gasto.toFixed(2)}): ${pendientes.length} documento(s) quedan ` +
            `pendientes para "Procesar pendientes"`,
        );
        return;
      }
    }

    const ins = await this.dataSource.pool.query(
      `INSERT INTO bdt_proceso (origen_bdrun, ide_inarti, total_bdrun, total_productos_bdrun, ide_empr, usuario_ingre)
       VALUES ('AUTOMATICO', $1, $2, 1, $3, 'AUTOMATICO') RETURNING ide_bdrun`,
      [ideInarti, pendientes.length, ideEmpr],
    );
    const ideBdrun: number = ins.rows[0].ide_bdrun;
    const contadores = nuevosContadores();
    const detalle: DetalleArchivo[] = [];
    let estado = 'OK';
    try {
      await this.proceso.procesarArchivosDeProducto({
        ideBdrun,
        ideInarti,
        ideEmpr,
        login: 'AUTOMATICO',
        uuids: pendientes.map((p) => p.uuid),
        contadores,
        detalle,
      });
      if (contadores.errores) estado = 'CON_ERRORES';
    } catch (error) {
      estado = 'FALLIDO';
      // Sin saldo: ya se avisó; lo que faltó queda pendiente para "Procesar pendientes".
      if (!(error instanceof CuentaIaError)) throw error;
      this.logger.warn(`Extracción automática detenida: ${error.message}`);
    } finally {
      await this.dataSource.pool
        .query(`UPDATE bdt_proceso SET estado_bdrun = $2, fecha_fin_bdrun = NOW() WHERE ide_bdrun = $1`, [ideBdrun, estado])
        .catch(() => undefined);
      this.logger.log(
        `Extracción automática ${pendientes[0].producto}: ${contadores.procesados} procesado(s) ` +
          `(${contadores.reutilizados} reutilizado(s)), ${contadores.errores} error(es), $${contadores.costo.toFixed(4)}`,
      );
    }
  }

  private async gastoAutomaticoHoy(ideEmpr: number): Promise<number> {
    const r = await this.dataSource.pool.query(
      `SELECT COALESCE(SUM(costo_usd_bdrun), 0) AS gasto FROM bdt_proceso
        WHERE ide_empr = $1 AND origen_bdrun = 'AUTOMATICO' AND fecha_inicio_bdrun >= CURRENT_DATE`,
      [ideEmpr],
    );
    return Number(r.rows[0].gasto);
  }

  // ------------------------------------------------------------------ configuración

  async getConfiguracion(ideEmpr: number): Promise<ConfiguracionBdt & { gasto_automatico_hoy: number }> {
    const r = await this.dataSource.pool.query(
      `SELECT auto_activo_bdcfg, tope_diario_usd_bdcfg FROM bdt_configuracion WHERE ide_empr = $1`,
      [ideEmpr],
    );
    const c = r.rows[0] ?? CONFIG_DEFECTO;
    return {
      auto_activo_bdcfg: c.auto_activo_bdcfg,
      tope_diario_usd_bdcfg: c.tope_diario_usd_bdcfg == null ? null : Number(c.tope_diario_usd_bdcfg),
      gasto_automatico_hoy: await this.gastoAutomaticoHoy(ideEmpr),
    };
  }

  async saveConfiguracion(dto: ConfiguracionBdt & { ideEmpr: number; login: string }) {
    await this.dataSource.pool.query(
      `INSERT INTO bdt_configuracion (ide_empr, auto_activo_bdcfg, tope_diario_usd_bdcfg, usuario_actua, fecha_actua)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (ide_empr) DO UPDATE SET auto_activo_bdcfg = EXCLUDED.auto_activo_bdcfg,
         tope_diario_usd_bdcfg = EXCLUDED.tope_diario_usd_bdcfg, usuario_actua = EXCLUDED.usuario_actua, fecha_actua = NOW()`,
      [dto.ideEmpr, dto.auto_activo_bdcfg, dto.tope_diario_usd_bdcfg, dto.login],
    );
    return { message: 'Configuración guardada' };
  }
}
