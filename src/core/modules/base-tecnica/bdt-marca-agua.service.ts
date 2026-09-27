import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { MarcaAguaService } from '../sistema/files/marca-agua.service';

interface EstadoMarcaAgua {
  activo: boolean;
  total: number;
  procesados: number;
  aplicadas: number;
  omitidas: number;
  errores: number;
  cancelado: boolean;
  inicio: string | null;
  fin: string | null;
  usuario: string | null;
  /** Últimos archivos que no se pudieron marcar (motivo). */
  detalle: { archivo: string; motivo: string }[];
}

const MAX_DETALLE = 30;

/**
 * Marca de agua a los documentos que ya estaban APROBADOS antes de existir la marca automática (página
 * Base Técnica → "Marca de agua a aprobados"). Los nuevos la reciben solos al aprobarse. Sin IA ni
 * costo: se procesa uno por uno en segundo plano y el avance se consulta con getEstado.
 */
@Injectable()
export class BdtMarcaAguaService {
  private readonly logger = new Logger(BdtMarcaAguaService.name);
  private readonly estados = new Map<number, EstadoMarcaAgua>();

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly marcaAgua: MarcaAguaService,
  ) {}

  /** Adjuntos aprobados (PDF / imagen) sin marca de agua, sin papelera. */
  private async pendientes(ideEmpr: number): Promise<{ uuid: string; nombre: string }[]> {
    const r = await this.dataSource.pool.query(
      `SELECT DISTINCT a.uuid::text AS uuid, a.nombre_arch AS nombre
         FROM bdt_documento d
         JOIN sis_archivo a ON a.uuid = d.uuid_origen_bddoc AND a.ide_empr = d.ide_empr
        WHERE d.ide_empr = $1 AND d.estado_bddoc = 'APROBADO'
          AND COALESCE(a.papelera_arch, FALSE) = FALSE AND COALESCE(a.carpeta_arch, FALSE) = FALSE
          AND to_jsonb(a) ->> 'marca_agua_arch' IS NULL
          AND LOWER(a.extension_arch) IN ('pdf', 'jpg', 'jpeg', 'png', 'webp')`,
      [ideEmpr],
    );
    return r.rows;
  }

  async getEstado(ideEmpr: number) {
    const e = this.estados.get(ideEmpr);
    const pendientes = e?.activo ? null : (await this.pendientes(ideEmpr)).length;
    return { ...(e ?? { activo: false }), pendientes };
  }

  iniciar(h: HeaderParamsDto) {
    if (this.estados.get(h.ideEmpr)?.activo) throw new BadRequestException('Ya se está aplicando la marca de agua');
    const estado: EstadoMarcaAgua = {
      activo: true,
      total: 0,
      procesados: 0,
      aplicadas: 0,
      omitidas: 0,
      errores: 0,
      cancelado: false,
      inicio: new Date().toISOString(),
      fin: null,
      usuario: h.login ?? null,
      detalle: [],
    };
    this.estados.set(h.ideEmpr, estado);
    this.ejecutar(h, estado).catch((error) => {
      this.logger.error(`Marca de agua masiva: ${(error as Error).message}`, (error as Error).stack);
      estado.activo = false;
      estado.fin = new Date().toISOString();
    });
    return { message: 'ok' };
  }

  cancelar(ideEmpr: number) {
    const e = this.estados.get(ideEmpr);
    if (e?.activo) e.cancelado = true;
    return { message: 'ok' };
  }

  private async ejecutar(h: HeaderParamsDto, estado: EstadoMarcaAgua) {
    const archivos = await this.pendientes(h.ideEmpr);
    estado.total = archivos.length;
    for (const a of archivos) {
      if (estado.cancelado) break;
      try {
        const r = await this.marcaAgua.aplicarAArchivo(a.uuid, h.ideEmpr, h.login ?? 'BASE_TECNICA');
        if (r.aplicada) estado.aplicadas++;
        else {
          estado.omitidas++;
          this.anotar(estado, a.nombre, 'motivo' in r ? r.motivo : 'Omitido');
        }
      } catch (error) {
        estado.errores++;
        this.anotar(estado, a.nombre, (error as Error).message);
      }
      estado.procesados++;
    }
    estado.activo = false;
    estado.fin = new Date().toISOString();
    this.logger.log(
      `Marca de agua masiva: ${estado.aplicadas} aplicadas, ${estado.omitidas} omitidas, ${estado.errores} errores de ${estado.total}`,
    );
  }

  private anotar(estado: EstadoMarcaAgua, archivo: string, motivo: string) {
    estado.detalle.unshift({ archivo, motivo });
    if (estado.detalle.length > MAX_DETALLE) estado.detalle.length = MAX_DETALLE;
  }
}
