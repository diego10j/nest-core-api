import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { detectMimeType } from 'src/util/helpers/file-utils';

import { CONOCIMIENTO_STORAGE } from '../../sistema/base-conocimiento/constants/base-conocimiento.constants';

import { ImagenNota, contenidoNota, fragmentos, resaltar, terminosBusqueda, tsqueryDeTerminos } from './conocimiento-quimia.helper';

/** Máximo de notas que QuimIA ofrece por respuesta ("Ver nota 1 … 5"). */
export const MAX_NOTAS_QUIMIA = 5;

/** Nota de la base de conocimiento encontrada para una pregunta (lo que ven la IA y el usuario). */
export interface NotaQuimia {
  ide_cono: number;
  uuid: string;
  titulo: string;
  categoria: string | null;
  tags: string[];
  fecha: string | null;
  /** Relacionada directamente con el producto / persona de la consulta. */
  relacionada: boolean;
  /** Términos de la pregunta que aparecen en la nota (para resaltarlos en negrilla). */
  terminos: string[];
  /** Fragmento del contenido alrededor de las coincidencias (contexto de la IA). */
  fragmento: string;
  tieneImagenes: boolean;
}

/** Nota completa para mostrarla (diálogo del ERP / mensaje de Telegram). */
export interface NotaCompleta {
  ide_cono: number;
  uuid: string;
  titulo: string;
  categoria: string | null;
  tags: string[];
  fecha: string | null;
  usuario: string | null;
  contenido: string | null;
  modo: string;
  /** Contenido en texto (bloques/HTML aplanados) e imágenes en orden. */
  texto: string;
  imagenes: ImagenNota[];
}

/**
 * Base de conocimiento del negocio (sis_conocimiento) como fuente de QuimIA: políticas internas,
 * productos restringidos, cuentas bancarias, tips… Son notas de interés general del equipo, así que
 * no hay control de visibilidad: toda nota ACTIVA de la empresa puede aparecer.
 *
 * Requiere scripts/quimia_conocimiento.sql (columna tsv_quimia_cono).
 */
@Injectable()
export class QuimiaConocimientoService {
  private readonly logger = new Logger(QuimiaConocimientoService.name);

  constructor(private readonly dataSource: DataSourceService) {}

  /**
   * Notas que coinciden con la pregunta (máximo 5). Primero las relacionadas con el producto o la
   * persona de la consulta; luego por texto completo, título aproximado y tags. Solo se devuelven
   * coincidencias relevantes: relacionada, título que coincide o al menos la mitad de los términos.
   */
  async buscar(
    pregunta: string,
    ideEmpr: number,
    ref: { ide_inarti?: number | null; ide_geper?: number | null } = {},
    limite = MAX_NOTAS_QUIMIA,
  ): Promise<NotaQuimia[]> {
    const terminos = terminosBusqueda(pregunta);
    const tsq = tsqueryDeTerminos(terminos);
    if (!tsq && !ref.ide_inarti && !ref.ide_geper) return [];

    let filas: any[] = [];
    try {
      const r = await this.dataSource.pool.query(
        `WITH q AS (SELECT CASE WHEN $2::text IS NULL THEN NULL ELSE to_tsquery('spanish', $2) END AS tsq)
         SELECT c.ide_cono, c.uuid::text AS uuid, c.titulo_cono, c.contenido_cono, c.modo_editor_cono,
                cat.nombre_ccat, TO_CHAR(COALESCE(c.fecha_actua_cono, c.fecha_reg_cono), 'YYYY-MM-DD') AS fecha,
                COALESCE((SELECT ARRAY_AGG(t.tag ORDER BY t.tag) FROM sis_conocimiento_tag t WHERE t.ide_cono = c.ide_cono), '{}') AS tags,
                EXISTS (SELECT 1 FROM sis_conocimiento_relacion r
                         WHERE r.ide_cono = c.ide_cono
                           AND ((r.tipo_relacion = 'PRODUCTO' AND r.ide_referencia = $3)
                             OR (r.tipo_relacion = 'PERSONA' AND r.ide_referencia = $4))) AS relacionada,
                COALESCE(ts_rank(c.tsv_quimia_cono, q.tsq), 0) AS rango,
                word_similarity(UPPER(bdt_f_unaccent($5)), UPPER(bdt_f_unaccent(c.titulo_cono))) AS sim_titulo
           FROM sis_conocimiento c
           CROSS JOIN q
           LEFT JOIN sis_conocimiento_categoria cat ON cat.ide_ccat = c.ide_ccat
          WHERE c.ide_empr = $1 AND c.estado_cono = 'ACTIVO'
            AND ((q.tsq IS NOT NULL AND c.tsv_quimia_cono @@ q.tsq)
              OR EXISTS (SELECT 1 FROM sis_conocimiento_relacion r
                          WHERE r.ide_cono = c.ide_cono
                            AND ((r.tipo_relacion = 'PRODUCTO' AND r.ide_referencia = $3)
                              OR (r.tipo_relacion = 'PERSONA' AND r.ide_referencia = $4)))
              OR EXISTS (SELECT 1 FROM sis_conocimiento_tag t
                          WHERE t.ide_cono = c.ide_cono AND LOWER(bdt_f_unaccent(t.tag)) = ANY($6::text[]))
              OR UPPER(bdt_f_unaccent($5)) <% UPPER(bdt_f_unaccent(c.titulo_cono)))
          ORDER BY relacionada DESC, rango DESC, sim_titulo DESC
          LIMIT 25`,
        [ideEmpr, tsq, ref.ide_inarti ?? null, ref.ide_geper ?? null, pregunta.slice(0, 300), terminos],
      );
      filas = r.rows;
    } catch (error) {
      // Sin el script quimia_conocimiento.sql la búsqueda falla: QuimIA sigue funcionando sin notas.
      this.logger.warn(`Búsqueda en base de conocimiento: ${(error as Error).message}`);
      return [];
    }

    const notas: (NotaQuimia & { puntaje: number })[] = [];
    for (const f of filas) {
      const { texto, imagenes } = contenidoNota(f.contenido_cono, f.modo_editor_cono);
      const enTitulo = resaltar(f.titulo_cono, terminos).coincidencias;
      const enTags = resaltar((f.tags as string[]).join(' '), terminos).coincidencias;
      const enTexto = resaltar(texto, terminos).coincidencias;
      const todas = [...new Set([...enTitulo, ...enTags, ...enTexto])];
      const cobertura = terminos.length ? todas.length / terminos.length : 0;
      const relevante =
        f.relacionada ||
        ((enTitulo.length || enTags.length) && cobertura >= 0.34) ||
        (todas.length >= Math.min(2, terminos.length) && cobertura >= 0.5) ||
        Number(f.sim_titulo) >= 0.6;
      if (!relevante) continue;
      notas.push({
        ide_cono: f.ide_cono,
        uuid: f.uuid,
        titulo: f.titulo_cono,
        categoria: f.nombre_ccat ?? null,
        tags: f.tags,
        fecha: f.fecha,
        relacionada: !!f.relacionada,
        terminos: todas,
        fragmento: fragmentos(texto, todas, 1800),
        tieneImagenes: imagenes.length > 0,
        puntaje: (f.relacionada ? 10 : 0) + cobertura * 3 + (enTitulo.length ? 1 : 0) + Number(f.rango) * 5,
      });
    }
    return notas
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, limite)
      .map(({ puntaje: _p, ...n }) => n);
  }

  /** Nota completa por uuid o ide_cono (solo ACTIVAS de la empresa). Cuenta una vista. */
  async obtener(id: { uuid?: string; ide_cono?: number }, ideEmpr: number): Promise<NotaCompleta | null> {
    const r = await this.dataSource.pool.query(
      `UPDATE sis_conocimiento c SET vistas_cono = COALESCE(vistas_cono, 0) + 1
        WHERE c.ide_empr = $1 AND c.estado_cono = 'ACTIVO'
          AND (($2::uuid IS NOT NULL AND c.uuid = $2::uuid) OR c.ide_cono = $3)
       RETURNING c.ide_cono, c.uuid::text AS uuid, c.titulo_cono, c.contenido_cono, c.modo_editor_cono, c.ide_ccat,
                 TO_CHAR(COALESCE(c.fecha_actua_cono, c.fecha_reg_cono), 'YYYY-MM-DD') AS fecha,
                 COALESCE(c.usuario_actua, c.usuario_ingre) AS usuario,
                 (SELECT nombre_ccat FROM sis_conocimiento_categoria cat WHERE cat.ide_ccat = c.ide_ccat) AS categoria,
                 COALESCE((SELECT ARRAY_AGG(t.tag ORDER BY t.tag) FROM sis_conocimiento_tag t WHERE t.ide_cono = c.ide_cono), '{}') AS tags`,
      [ideEmpr, id.uuid ?? null, id.ide_cono ?? null],
    );
    const f = r.rows[0];
    if (!f) return null;
    const { texto, imagenes } = contenidoNota(f.contenido_cono, f.modo_editor_cono);
    return {
      ide_cono: f.ide_cono,
      uuid: f.uuid,
      titulo: f.titulo_cono,
      categoria: f.categoria ?? null,
      tags: f.tags,
      fecha: f.fecha,
      usuario: f.usuario ?? null,
      contenido: f.contenido_cono,
      modo: f.modo_editor_cono || 'HTML',
      texto,
      imagenes,
    };
  }

  /**
   * Bytes de una imagen de la nota guardada en la base de conocimiento (para enviarla como foto por
   * Telegram sin depender de que la URL guardada sea pública). null si es una URL externa o no existe.
   */
  async leerImagen(img: ImagenNota): Promise<{ buffer: Buffer; nombre: string; mime: string } | null> {
    if (!img.uuid) return null;
    const r = await this.dataSource.pool.query(
      `SELECT nombre_disco_carc, nombre_original_carc, mime_carc FROM sis_conocimiento_archivo WHERE uuid = $1::uuid LIMIT 1`,
      [img.uuid],
    );
    let nombreDisco: string | undefined = r.rows[0]?.nombre_disco_carc;
    // Igual que downloadArchivo: una imagen recién subida puede no tener fila aún.
    if (!nombreDisco && existsSync(CONOCIMIENTO_STORAGE.BASE_PATH)) {
      nombreDisco = readdirSync(CONOCIMIENTO_STORAGE.BASE_PATH).find((f) => f.startsWith(`${img.uuid}.`));
    }
    if (!nombreDisco) return null;
    const ruta = join(CONOCIMIENTO_STORAGE.BASE_PATH, nombreDisco);
    if (!existsSync(ruta)) return null;
    return {
      buffer: readFileSync(ruta),
      nombre: r.rows[0]?.nombre_original_carc || nombreDisco,
      mime: r.rows[0]?.mime_carc || detectMimeType(nombreDisco) || 'image/jpeg',
    };
  }
}
