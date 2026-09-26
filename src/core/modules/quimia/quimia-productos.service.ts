import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ProductosService } from '../inventario/productos/productos.service';

import {
  EntradaIndiceProducto,
  MAX_OPCIONES_PRODUCTO,
  detectarProductos,
  detectarProductosTolerante,
  elegirProductoDetectado,
} from './helpers/detector-producto.helper';
import { ProductoCandidato, ProductoQuimia, UsuarioQuimia } from './quimia.types';

/** Parecido mínimo (0..1, trigramas) para que la búsqueda aproximada considere un producto. */
const UMBRAL_APROXIMADO = 0.35;

/** Producto encontrado en el catálogo del ERP (para la herramienta y el selector del chat). */
export interface ProductoCatalogo {
  ide_inarti: number;
  nombre: string;
  codigo: string | null;
  unidad: string | null;
  stock: number;
  categoria: string | null;
  documentos_tecnicos: number;
  /** Solo en la búsqueda aproximada: qué tan parecido es al texto buscado (0..1). */
  parecido?: number;
}

/**
 * Identificación de productos para QuimIA sobre TODO el catálogo del ERP (inv_articulo activos),
 * más los sinónimos que la base técnica aprendió de los documentos (nombres en inglés, INCI…).
 */
@Injectable()
export class QuimiaProductosService {
  private cacheIndice = new Map<number, { expira: number; data: EntradaIndiceProducto[] }>();

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly productos: ProductosService,
  ) {}

  /** Productos mencionados en la pregunta, ordenados por relevancia (ver detector-producto.helper). */
  async detectar(texto: string, ideEmpr: number, opciones: { tolerante?: boolean } = {}): Promise<ProductoCandidato[]> {
    const indice = await this.getIndice(ideEmpr);
    let candidatos = detectarProductos(texto, indice);
    // Respaldo tolerante a errores de escritura o de transcripción de voz, SOLO cuando el filtro
    // exacto no identifica un producto (nada, o solo coincidencias genéricas: en "ácido estiárico"
    // el exacto encuentra todos los ÁCIDOS). Se usa si cubre más de la pregunta que el exacto.
    if (opciones.tolerante !== false && elegirProductoDetectado(candidatos).tipo !== 'uno') {
      const tolerantes = detectarProductosTolerante(texto, indice);
      if (tolerantes.length && (!candidatos.length || tolerantes[0].cobertura > candidatos[0].cobertura + 1e-9)) {
        candidatos = tolerantes;
      }
    }
    return candidatos.slice(0, MAX_OPCIONES_PRODUCTO).map(({ ide_inarti, nombre, coincidencia, cobertura, similitud, documentos }) => ({
      ide_inarti,
      nombre,
      coincidencia,
      cobertura,
      similitud,
      documentos,
    }));
  }

  elegir(candidatos: ProductoCandidato[]) {
    return elegirProductoDetectado(candidatos);
  }

  async getProducto(ideInarti: number, ideEmpr: number): Promise<ProductoQuimia | null> {
    const r = await this.dataSource.pool.query(
      `SELECT ide_inarti, nombre_inarti AS nombre FROM inv_articulo WHERE ide_inarti = $1 AND ide_empr = $2`,
      [ideInarti, ideEmpr],
    );
    return r.rows[0] ?? null;
  }

  /**
   * Búsqueda libre en el catálogo: primero la búsqueda exacta del ERP (con stock); solo si no
   * encuentra nada, la búsqueda aproximada (buscarAproximado).
   */
  async buscar(texto: string, usuario: UsuarioQuimia, limite = MAX_OPCIONES_PRODUCTO): Promise<ProductoCatalogo[]> {
    const valor = (texto ?? '').trim();
    if (!valor) return this.recientesConBaseTecnica(usuario.ideEmpr, limite);

    const exactos = await this.buscarExacto(valor, usuario, limite);
    return exactos.length ? exactos : this.buscarAproximado(valor, usuario.ideEmpr, limite);
  }

  private async buscarExacto(valor: string, usuario: UsuarioQuimia, limite: number): Promise<ProductoCatalogo[]> {
    const rows = await this.productos.searchProducto({
      ...usuario,
      value: valor,
      limit: limite,
      soloVentas: 'false',
    } as any);
    return this.conDocumentos(
      rows.map((p) => ({
        ide_inarti: p.ide_inarti,
        nombre: p.nombre_inarti,
        codigo: p.codigo_inarti ?? null,
        unidad: p.siglas_inuni ?? null,
        stock: Number(p.saldo ?? 0),
        categoria: p.nombre_incate ?? null,
        documentos_tecnicos: 0,
      })),
      usuario.ideEmpr,
    );
  }

  /**
   * Búsqueda aproximada en el catálogo por nombre_inarti y otro_nombre_inarti (trigramas, sin
   * tildes): tolera errores de escritura o de transcripción. Máximo `limite` (10) productos,
   * ordenados por parecido. Se usa SOLO cuando la búsqueda exacta no encuentra nada.
   */
  async buscarAproximado(texto: string, ideEmpr: number, limite = MAX_OPCIONES_PRODUCTO): Promise<ProductoCatalogo[]> {
    const r = await this.dataSource.pool.query(
      `WITH q AS (SELECT UPPER(bdt_f_unaccent($1)) AS t),
       candidatos AS (
          SELECT a.ide_inarti, a.nombre_inarti AS nombre, a.codigo_inarti AS codigo, u.siglas_inuni AS unidad,
                 c.nombre_incate AS categoria,
                 GREATEST(
                   similarity(UPPER(bdt_f_unaccent(a.nombre_inarti)), q.t),
                   word_similarity(q.t, UPPER(bdt_f_unaccent(a.nombre_inarti))),
                   COALESCE(similarity(UPPER(bdt_f_unaccent(a.otro_nombre_inarti)), q.t), 0),
                   COALESCE(word_similarity(q.t, UPPER(bdt_f_unaccent(a.otro_nombre_inarti))), 0)
                 ) AS parecido
            FROM inv_articulo a
            LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni
            LEFT JOIN inv_categoria c ON c.ide_incate = a.ide_incate, q
           WHERE a.ide_empr = $2 AND a.activo_inarti = TRUE AND a.nivel_inarti = 'HIJO'
       )
       SELECT * FROM candidatos WHERE parecido >= $3 ORDER BY parecido DESC, nombre LIMIT $4`,
      [texto, ideEmpr, UMBRAL_APROXIMADO, limite],
    );
    // Se descartan los que quedan muy por debajo del mejor: en "ácido estiárico" los demás ÁCIDOS
    // solo se parecen por la palabra genérica.
    const mejor = Number(r.rows[0]?.parecido ?? 0);
    const cercanos = r.rows.filter((p) => Number(p.parecido) >= mejor * 0.75);
    return this.conDocumentos(
      cercanos.map((p) => ({
        ide_inarti: p.ide_inarti,
        nombre: p.nombre,
        codigo: p.codigo ?? null,
        unidad: p.unidad ?? null,
        stock: null,
        categoria: p.categoria ?? null,
        documentos_tecnicos: 0,
        parecido: Math.round(Number(p.parecido) * 100) / 100,
      })),
      ideEmpr,
    );
  }

  private async recientesConBaseTecnica(ideEmpr: number, limite: number): Promise<ProductoCatalogo[]> {
    const r = await this.dataSource.pool.query(
      `SELECT p.ide_inarti, a.nombre_inarti AS nombre, a.codigo_inarti AS codigo, u.siglas_inuni AS unidad,
              p.total_documentos_bdprd AS documentos_tecnicos
         FROM bdt_producto p
         JOIN inv_articulo a ON a.ide_inarti = p.ide_inarti
         LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni
        WHERE p.ide_empr = $1 AND p.total_documentos_bdprd > 0
        ORDER BY p.fecha_ultimo_proceso_bdprd DESC NULLS LAST
        LIMIT $2`,
      [ideEmpr, limite],
    );
    return r.rows.map((x) => ({ ...x, stock: null, categoria: null, documentos_tecnicos: Number(x.documentos_tecnicos) }));
  }

  private async conDocumentos(productos: ProductoCatalogo[], ideEmpr: number): Promise<ProductoCatalogo[]> {
    if (!productos.length) return productos;
    const r = await this.dataSource.pool.query(
      `SELECT ide_inarti, total_documentos_bdprd AS docs FROM bdt_producto WHERE ide_empr = $1 AND ide_inarti = ANY($2)`,
      [ideEmpr, productos.map((p) => p.ide_inarti)],
    );
    const docs = new Map<number, number>(r.rows.map((x) => [x.ide_inarti, Number(x.docs)]));
    return productos.map((p) => ({ ...p, documentos_tecnicos: docs.get(p.ide_inarti) ?? 0 }));
  }

  /**
   * Índice de nombres del catálogo (nombre, otro nombre, código) + sinónimos de la base técnica.
   * Cache de 10 min por empresa: el catálogo cambia poco y el detector corre en cada pregunta.
   */
  private async getIndice(ideEmpr: number): Promise<EntradaIndiceProducto[]> {
    const cache = this.cacheIndice.get(ideEmpr);
    if (cache && cache.expira > Date.now()) return cache.data;

    const r = await this.dataSource.pool.query(
      `WITH art AS (
          SELECT a.ide_inarti, a.nombre_inarti, a.otro_nombre_inarti, a.codigo_inarti,
                 COALESCE(p.total_documentos_bdprd, 0) AS documentos
            FROM inv_articulo a
            LEFT JOIN bdt_producto p ON p.ide_inarti = a.ide_inarti
           WHERE a.ide_empr = $1 AND a.activo_inarti = TRUE AND a.nivel_inarti = 'HIJO'
       )
       SELECT ide_inarti, nombre_inarti AS nombre, nombre_inarti AS texto, documentos FROM art
       UNION ALL
       SELECT ide_inarti, nombre_inarti, otro_nombre_inarti, documentos FROM art
        WHERE COALESCE(TRIM(otro_nombre_inarti), '') <> ''
       UNION ALL
       SELECT ide_inarti, nombre_inarti, codigo_inarti, documentos FROM art
        WHERE COALESCE(TRIM(codigo_inarti), '') <> ''
       UNION ALL
       SELECT art.ide_inarti, art.nombre_inarti, s.sinonimo_bdsin, art.documentos
         FROM bdt_sinonimo s JOIN art ON art.ide_inarti = s.ide_inarti
        WHERE s.ide_empr = $1`,
      [ideEmpr],
    );
    const data = r.rows.map((x) => ({ ...x, documentos: Number(x.documentos) }));
    this.cacheIndice.set(ideEmpr, { expira: Date.now() + 10 * 60_000, data });
    return data;
  }
}
