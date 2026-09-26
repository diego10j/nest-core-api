import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { BdtProcesoService, ContextoCorrida, DetalleArchivo, nuevosContadores } from './bdt-proceso.service';
import { CuentaIaError } from './helpers/errores-ia.helper';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Extracción masiva ("Procesar pendientes" de la página Base Técnica) y "extracción mejorada" en lote.
 *
 * Corre en segundo plano en el servidor; el avance vive en bdt_proceso (origen MASIVO), así que la
 * página puede cerrarse y al volver retoma la barra de avance. Una sola corrida masiva por empresa.
 * Pausar/cancelar se revisan entre un archivo y el siguiente (nunca queda un documento a medias).
 */
@Injectable()
export class BdtMasivoService implements OnModuleInit {
  private readonly logger = new Logger(BdtMasivoService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proceso: BdtProcesoService,
  ) {}

  /** Corridas que quedaron a medias por un reinicio del servidor: se marcan como interrumpidas. */
  async onModuleInit() {
    try {
      await this.dataSource.pool.query(
        `UPDATE bdt_proceso SET estado_bdrun = 'INTERRUMPIDO', fecha_fin_bdrun = NOW()
          WHERE origen_bdrun IN ('MASIVO', 'AUTOMATICO', 'MEJORADO') AND estado_bdrun IN ('EJECUTANDO', 'PAUSADO')`,
      );
    } catch (error) {
      // Sin scripts/base_tecnica_masivo.sql aún: no debe impedir que el servidor arranque.
      this.logger.warn(`No se pudieron cerrar corridas interrumpidas: ${(error as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ resumen para la página

  async getResumen(ideEmpr: number) {
    const [docs, pendientes] = await Promise.all([
      this.dataSource.pool.query(
        `SELECT COUNT(*) FILTER (WHERE estado_bddoc = 'APROBADO') AS aprobados,
                COUNT(*) FILTER (WHERE estado_bddoc = 'REVISION') AS revision,
                COUNT(*) FILTER (WHERE estado_bddoc = 'RECHAZADO') AS rechazados,
                COUNT(*) FILTER (WHERE estado_bddoc = 'ERROR') AS errores,
                COUNT(*) FILTER (WHERE ide_bddoc_origen IS NOT NULL) AS reutilizados,
                COUNT(*) FILTER (WHERE metodo_extraccion_bddoc = 'VISION') AS escaneados,
                COUNT(*) AS total,
                COALESCE(SUM(costo_usd_bddoc), 0) AS costo_total,
                COALESCE(AVG(costo_usd_bddoc) FILTER (WHERE ide_bddoc_origen IS NULL AND costo_usd_bddoc > 0), 0) AS costo_promedio
           FROM bdt_documento WHERE ide_empr = $1`,
        [ideEmpr],
      ),
      this.proceso.listarPendientes(ideEmpr),
    ]);
    const d = docs.rows[0];
    const costoPromedio = Number(d.costo_promedio) || 0.002;
    return {
      total: Number(d.total),
      aprobados: Number(d.aprobados),
      revision: Number(d.revision),
      rechazados: Number(d.rechazados),
      errores: Number(d.errores),
      reutilizados: Number(d.reutilizados),
      escaneados: Number(d.escaneados),
      pendientes: pendientes.length,
      productosPendientes: new Set(pendientes.map((p) => p.ide_inarti)).size,
      costoTotal: Number(d.costo_total),
      costoPromedio,
      // Estimado: los que resulten iguales a otro documento ya extraído costarán 0.
      costoEstimadoPendientes: Math.round(pendientes.length * costoPromedio * 100) / 100,
    };
  }

  /** Última corrida masiva (o la que está en curso) para la barra de avance. */
  async getEstado(ideEmpr: number) {
    const r = await this.dataSource.pool.query(
      `SELECT ide_bdrun, origen_bdrun, estado_bdrun, fecha_inicio_bdrun, fecha_fin_bdrun, total_bdrun, procesados_bdrun,
              sin_cambios_bdrun, omitidos_bdrun, revision_bdrun, errores_bdrun, reutilizados_bdrun, costo_usd_bdrun,
              total_productos_bdrun, productos_listos_bdrun, producto_actual_bdrun, archivo_actual_bdrun,
              pausado_bdrun, cancelado_bdrun, motivo_pausa_bdrun, usuario_ingre, detalle_bdrun
         FROM bdt_proceso
        WHERE ide_empr = $1 AND origen_bdrun IN ('MASIVO', 'MEJORADO')
        ORDER BY ide_bdrun DESC LIMIT 1`,
      [ideEmpr],
    );
    const c = r.rows[0];
    if (!c) return { corrida: null };
    const hechos = Number(c.procesados_bdrun) + Number(c.sin_cambios_bdrun) + Number(c.omitidos_bdrun) + Number(c.errores_bdrun);
    const total = Number(c.total_bdrun) || 0;
    const segundos = (Date.now() - new Date(c.fecha_inicio_bdrun).getTime()) / 1000;
    const activa = ['EJECUTANDO', 'PAUSADO'].includes(c.estado_bdrun);
    return {
      corrida: {
        ...c,
        costo_usd_bdrun: Number(c.costo_usd_bdrun),
        hechos,
        porcentaje: total ? Math.min(100, Math.round((hechos / total) * 100)) : 0,
        activa,
        // Estimado a partir del ritmo actual (solo mientras corre).
        segundosRestantes: activa && hechos > 0 && c.estado_bdrun === 'EJECUTANDO' ? Math.round((segundos / hechos) * (total - hechos)) : null,
        // Solo los últimos del detalle: la página muestra "lo último procesado".
        detalle_bdrun: ((c.detalle_bdrun ?? []) as DetalleArchivo[]).slice(-15).reverse(),
      },
    };
  }

  // ------------------------------------------------------------------ corrida masiva

  async iniciar(dto: HeaderParamsDto) {
    const enCurso = await this.corridaActiva(dto.ideEmpr);
    if (enCurso) return { ide_bdrun: enCurso, enCurso: true };

    const pendientes = await this.proceso.listarPendientes(dto.ideEmpr);
    if (!pendientes.length) throw new BadRequestException('No hay documentos pendientes de extraer');

    const productos = new Map<number, string[]>();
    pendientes.forEach((p) => productos.set(p.ide_inarti, [...(productos.get(p.ide_inarti) ?? []), p.uuid]));

    const ins = await this.dataSource.pool.query(
      `INSERT INTO bdt_proceso (origen_bdrun, total_bdrun, total_productos_bdrun, ide_empr, usuario_ingre)
       VALUES ('MASIVO', $1, $2, $3, $4) RETURNING ide_bdrun`,
      [pendientes.length, productos.size, dto.ideEmpr, dto.login],
    );
    const ideBdrun: number = ins.rows[0].ide_bdrun;
    setImmediate(() => {
      this.ejecutar(ideBdrun, dto.ideEmpr, dto.login, productos, false).catch((err) =>
        this.logger.error(`Corrida masiva ${ideBdrun} falló: ${err?.message}`, err?.stack),
      );
    });
    return { ide_bdrun: ideBdrun, enCurso: false, total: pendientes.length, productos: productos.size };
  }

  /**
   * "Extracción mejorada" de documentos ya extraídos (selección de la tabla): transcripción +
   * extracción con el modelo superior. Corre en segundo plano como una corrida MEJORADO.
   */
  async iniciarMejorado(dto: { ides_bddoc: number[] } & HeaderParamsDto) {
    const enCurso = await this.corridaActiva(dto.ideEmpr);
    if (enCurso) throw new BadRequestException('Hay una extracción masiva en curso: espera a que termine o cancélala');

    const r = await this.dataSource.pool.query(
      `SELECT ide_inarti, uuid_origen_bddoc::text AS uuid FROM bdt_documento
        WHERE ide_bddoc = ANY($1::int[]) AND ide_empr = $2`,
      [dto.ides_bddoc, dto.ideEmpr],
    );
    if (!r.rows.length) throw new BadRequestException('No se encontraron los documentos');
    const productos = new Map<number, string[]>();
    r.rows.forEach((d) => productos.set(d.ide_inarti, [...(productos.get(d.ide_inarti) ?? []), d.uuid]));

    const ins = await this.dataSource.pool.query(
      `INSERT INTO bdt_proceso (origen_bdrun, forzar_bdrun, total_bdrun, total_productos_bdrun, ide_empr, usuario_ingre)
       VALUES ('MEJORADO', TRUE, $1, $2, $3, $4) RETURNING ide_bdrun`,
      [r.rows.length, productos.size, dto.ideEmpr, dto.login],
    );
    const ideBdrun: number = ins.rows[0].ide_bdrun;
    setImmediate(() => {
      this.ejecutar(ideBdrun, dto.ideEmpr, dto.login, productos, true).catch((err) =>
        this.logger.error(`Extracción mejorada ${ideBdrun} falló: ${err?.message}`, err?.stack),
      );
    });
    return { ide_bdrun: ideBdrun, total: r.rows.length };
  }

  async pausar(ideEmpr: number, pausar: boolean) {
    const r = await this.dataSource.pool.query(
      `UPDATE bdt_proceso SET pausado_bdrun = $2
        WHERE ide_empr = $1 AND origen_bdrun IN ('MASIVO', 'MEJORADO') AND estado_bdrun IN ('EJECUTANDO', 'PAUSADO')
        RETURNING ide_bdrun`,
      [ideEmpr, pausar],
    );
    if (!r.rows.length) throw new BadRequestException('No hay una extracción masiva en curso');
    return { message: pausar ? 'La extracción se pausará al terminar el documento actual' : 'Extracción reanudada' };
  }

  async cancelar(ideEmpr: number) {
    const r = await this.dataSource.pool.query(
      `UPDATE bdt_proceso SET cancelado_bdrun = TRUE, pausado_bdrun = FALSE
        WHERE ide_empr = $1 AND origen_bdrun IN ('MASIVO', 'MEJORADO') AND estado_bdrun IN ('EJECUTANDO', 'PAUSADO')
        RETURNING ide_bdrun`,
      [ideEmpr],
    );
    if (!r.rows.length) throw new BadRequestException('No hay una extracción masiva en curso');
    return { message: 'La extracción se detendrá al terminar el documento actual' };
  }

  private async corridaActiva(ideEmpr: number): Promise<number | null> {
    const r = await this.dataSource.pool.query(
      `SELECT ide_bdrun FROM bdt_proceso
        WHERE ide_empr = $1 AND origen_bdrun IN ('MASIVO', 'MEJORADO') AND estado_bdrun IN ('EJECUTANDO', 'PAUSADO')
        ORDER BY ide_bdrun DESC LIMIT 1`,
      [ideEmpr],
    );
    return r.rows[0]?.ide_bdrun ?? null;
  }

  private async ejecutar(ideBdrun: number, ideEmpr: number, login: string, productos: Map<number, string[]>, mejorado: boolean) {
    const contadores: ContextoCorrida['contadores'] = nuevosContadores();
    const detalle: DetalleArchivo[] = [];
    let listos = 0;
    let cancelado = false;

    /** Pausa (espera hasta reanudar) o cancelación: se revisa antes de cada archivo. */
    const debeParar = async (): Promise<boolean> => {
      for (;;) {
        const r = await this.dataSource.pool.query(`SELECT pausado_bdrun, cancelado_bdrun FROM bdt_proceso WHERE ide_bdrun = $1`, [
          ideBdrun,
        ]);
        const f = r.rows[0];
        if (!f || f.cancelado_bdrun) {
          cancelado = true;
          return true;
        }
        if (!f.pausado_bdrun) {
          await this.dataSource.pool.query(
            `UPDATE bdt_proceso SET estado_bdrun = 'EJECUTANDO', motivo_pausa_bdrun = NULL WHERE ide_bdrun = $1 AND estado_bdrun = 'PAUSADO'`,
            [ideBdrun],
          );
          return false;
        }
        await this.dataSource.pool.query(`UPDATE bdt_proceso SET estado_bdrun = 'PAUSADO' WHERE ide_bdrun = $1 AND estado_bdrun = 'EJECUTANDO'`, [
          ideBdrun,
        ]);
        await esperar(3000);
      }
    };

    try {
      const lista = [...productos];
      for (let i = 0; i < lista.length; i++) {
        const [ideInarti, uuids] = lista[i];
        if (cancelado || (await debeParar())) break;
        const nombre = (await this.proceso.getProductoErp(ideInarti).catch(() => null))?.nombre ?? String(ideInarti);
        await this.dataSource.pool.query(`UPDATE bdt_proceso SET producto_actual_bdrun = $2 WHERE ide_bdrun = $1`, [
          ideBdrun,
          nombre.slice(0, 250),
        ]);
        try {
          await this.proceso.procesarArchivosDeProducto({
            ideBdrun,
            ideInarti,
            ideEmpr,
            login,
            uuids,
            mejorado,
            contadores,
            detalle,
            debeParar,
            alIniciarArchivo: (archivo) =>
              this.dataSource.pool
                .query(`UPDATE bdt_proceso SET archivo_actual_bdrun = $2 WHERE ide_bdrun = $1`, [ideBdrun, archivo.slice(0, 255)])
                .then(() => undefined),
          });
        } catch (error) {
          if (error instanceof CuentaIaError) {
            // OpenAI sin saldo: la corrida se pausa sola (ya se avisó al administrador) y, al
            // reanudar después de recargar, se repite este mismo producto (lo leído se conserva).
            await this.dataSource.pool.query(
              `UPDATE bdt_proceso SET pausado_bdrun = TRUE, estado_bdrun = 'PAUSADO', motivo_pausa_bdrun = $2 WHERE ide_bdrun = $1`,
              [ideBdrun, error.message.slice(0, 250)],
            );
            i--;
            continue;
          }
          // Un producto con problemas (ej. se borró) no detiene la corrida.
          contadores.errores += uuids.length;
          detalle.push({ archivo: '(producto)', carpeta: '', producto: nombre, estado: 'ERROR', error: (error as Error).message });
          this.logger.warn(`Corrida ${ideBdrun} · ${nombre}: ${(error as Error).message}`);
        }
        listos++;
        await this.dataSource.pool.query(`UPDATE bdt_proceso SET productos_listos_bdrun = $2 WHERE ide_bdrun = $1`, [ideBdrun, listos]);
      }
      const estado = cancelado ? 'CANCELADO' : contadores.errores ? 'CON_ERRORES' : 'OK';
      await this.dataSource.pool.query(
        `UPDATE bdt_proceso SET estado_bdrun = $2, fecha_fin_bdrun = NOW(), producto_actual_bdrun = NULL,
                archivo_actual_bdrun = NULL, pausado_bdrun = FALSE
          WHERE ide_bdrun = $1`,
        [ideBdrun, estado],
      );
      this.logger.log(
        `Corrida ${ideBdrun} ${estado}: ${contadores.procesados} procesados (${contadores.reutilizados} reutilizados), ` +
          `${contadores.errores} errores, $${contadores.costo.toFixed(4)}`,
      );
    } catch (error) {
      await this.dataSource.pool
        .query(`UPDATE bdt_proceso SET estado_bdrun = 'FALLIDO', fecha_fin_bdrun = NOW() WHERE ide_bdrun = $1`, [ideBdrun])
        .catch(() => undefined);
      throw error;
    }
  }
}
