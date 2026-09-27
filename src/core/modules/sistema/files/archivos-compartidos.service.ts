import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ArchivoSubidoEmitter } from './archivo-subido.emitter';

/**
 * "Reutilizar documento": el mismo archivo (ficha técnica, hoja de seguridad, COA genérico) asociado a
 * varios productos sin subirlo de nuevo. Cada producto tiene su registro en sis_archivo (mismo nombre)
 * que apunta al MISMO archivo en disco (nombre2_arch): eso es lo que agrupa a los compartidos.
 *
 * - Marca de agua / reemplazo se aplican al archivo físico: valen para todos.
 * - Eliminar uno lo elimina de todos (FilesService.deleteFiles expande el grupo).
 * - La base técnica recibe el aviso SUBIDO de cada registro nuevo y reutiliza la extracción del
 *   original por su hash (sin IA ni costo).
 */
@Injectable()
export class ArchivosCompartidosService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly archivoEventos: ArchivoSubidoEmitter,
  ) {}

  /** Registro original a partir de su uuid (solo archivos, no carpetas). */
  private async archivo(uuid: string, ideEmpr: number) {
    const r = await this.dataSource.pool.query(
      `SELECT ide_arch, uuid::text AS uuid, nombre_arch, nombre2_arch, extension_arch, type_arch, peso_arch, ide_inarti,
              carpeta_arch, ide_empr
         FROM sis_archivo WHERE uuid = $1::uuid AND ide_empr = $2`,
      [uuid, ideEmpr],
    );
    const a = r.rows[0];
    if (!a || a.carpeta_arch) throw new BadRequestException('El archivo no existe');
    if (!a.nombre2_arch) throw new BadRequestException('El archivo no tiene contenido en el almacenamiento');
    return a;
  }

  /** Productos que comparten el archivo (incluido el propio), sin papelera. */
  async productos(uuid: string, h: HeaderParamsDto) {
    const a = await this.archivo(uuid, h.ideEmpr);
    const r = await this.dataSource.pool.query(
      `SELECT x.uuid::text AS uuid, x.ide_inarti, p.nombre_inarti, p.codigo_inarti, x.nombre_arch,
              (x.ide_arch = $3) AS actual
         FROM sis_archivo x
         LEFT JOIN inv_articulo p ON p.ide_inarti = x.ide_inarti
        WHERE x.nombre2_arch = $1 AND x.ide_empr = $2 AND COALESCE(x.papelera_arch, FALSE) = FALSE
        ORDER BY (x.ide_arch = $3) DESC, p.nombre_inarti`,
      [a.nombre2_arch, h.ideEmpr, a.ide_arch],
    );
    return { archivo: a.nombre_arch, total: r.rows.length, productos: r.rows };
  }

  /**
   * Asocia el archivo a otros productos: un registro nuevo por producto (en la raíz de sus archivos),
   * con el mismo nombre y el mismo archivo en disco. Omite los productos que ya lo tienen o que ya
   * tienen otro archivo con ese nombre en la raíz.
   */
  async reutilizar(uuid: string, productos: number[], h: HeaderParamsDto) {
    const a = await this.archivo(uuid, h.ideEmpr);
    const destino = [...new Set((productos ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].filter(
      (p) => p !== Number(a.ide_inarti),
    );
    if (!destino.length) throw new BadRequestException('Selecciona al menos un producto');

    const existentes = await this.dataSource.pool.query(
      `SELECT ide_inarti,
              BOOL_OR(nombre2_arch = $2) AS mismo_archivo,
              BOOL_OR(nombre2_arch <> $2 AND sis_ide_arch IS NULL AND LOWER(nombre_arch) = LOWER($3)) AS mismo_nombre
         FROM sis_archivo
        WHERE ide_empr = $1 AND ide_inarti = ANY($4::int[]) AND carpeta_arch = FALSE AND COALESCE(papelera_arch, FALSE) = FALSE
        GROUP BY ide_inarti`,
      [h.ideEmpr, a.nombre2_arch, a.nombre_arch, destino],
    );
    const estado = new Map<number, { mismo_archivo: boolean; mismo_nombre: boolean }>(
      existentes.rows.map((r) => [Number(r.ide_inarti), { mismo_archivo: !!r.mismo_archivo, mismo_nombre: !!r.mismo_nombre }]),
    );
    const productosValidos = await this.dataSource.pool.query(
      `SELECT ide_inarti, nombre_inarti FROM inv_articulo WHERE ide_inarti = ANY($1::int[]) AND ide_empr = $2`,
      [destino, h.ideEmpr],
    );
    const nombres = new Map<number, string>(productosValidos.rows.map((r) => [Number(r.ide_inarti), String(r.nombre_inarti)]));

    const asociados: { ide_inarti: number; producto: string; uuid: string }[] = [];
    const omitidos: { ide_inarti: number; producto: string | null; motivo: string }[] = [];
    for (const ideInarti of destino) {
      const producto = nombres.get(ideInarti) ?? null;
      const e = estado.get(ideInarti);
      if (!producto) {
        omitidos.push({ ide_inarti: ideInarti, producto, motivo: 'El producto no existe' });
        continue;
      }
      if (e?.mismo_archivo) {
        omitidos.push({ ide_inarti: ideInarti, producto, motivo: 'Ya tiene este documento' });
        continue;
      }
      if (e?.mismo_nombre) {
        omitidos.push({ ide_inarti: ideInarti, producto, motivo: `Ya tiene otro archivo llamado "${a.nombre_arch}"` });
        continue;
      }
      const ide = await this.dataSource.getSeqTable('sis_archivo', 'ide_arch', 1, h.login);
      const r = await this.dataSource.pool.query(
        `INSERT INTO sis_archivo (ide_arch, uuid, nombre_arch, nombre2_arch, peso_arch, carpeta_arch, sis_ide_arch, ide_inarti,
                                  public_arch, favorita_arch, type_arch, extension_arch, descargas_arch, ide_empr,
                                  usuario_ingre, fecha_ingre, hora_ingre)
         VALUES ($1, gen_random_uuid(), $2, $3, $4, FALSE, NULL, $5, TRUE, FALSE, $6, $7, 0, $8, $9, NOW(), NOW())
         RETURNING uuid::text AS uuid`,
        [ide, a.nombre_arch, a.nombre2_arch, a.peso_arch, ideInarti, a.type_arch, a.extension_arch, h.ideEmpr, (h.login ?? '').slice(0, 50)],
      );
      const nuevo = r.rows[0].uuid;
      asociados.push({ ide_inarti: ideInarti, producto, uuid: nuevo });
      // La base técnica reutiliza la extracción del original (mismo archivo = mismo hash, sin IA).
      this.archivoEventos.emitir({ uuid: nuevo, ideEmpr: h.ideEmpr, accion: 'SUBIDO' });
    }
    return { archivo: a.nombre_arch, asociados, omitidos };
  }

  /**
   * Quita el documento de UN producto sin borrar el archivo de los demás. Si es el último que lo tiene,
   * no se permite (para eso está Eliminar).
   */
  async desvincular(uuid: string, h: HeaderParamsDto) {
    const a = await this.archivo(uuid, h.ideEmpr);
    const otros = await this.dataSource.pool.query(
      `SELECT COUNT(*)::int AS n FROM sis_archivo WHERE nombre2_arch = $1 AND ide_empr = $2 AND ide_arch <> $3`,
      [a.nombre2_arch, h.ideEmpr, a.ide_arch],
    );
    if (!otros.rows[0].n) throw new BadRequestException('Es el único producto con este documento: usa Eliminar');
    await this.dataSource.pool.query(`DELETE FROM sis_archivo WHERE ide_arch = $1`, [a.ide_arch]);
    // La base técnica quita la extracción de ESTE producto (con su historial); los demás la conservan.
    this.archivoEventos.emitir({ uuid, ideEmpr: h.ideEmpr, accion: 'DESVINCULADO', login: h.login });
    return { message: 'ok', quedan: otros.rows[0].n };
  }
}
