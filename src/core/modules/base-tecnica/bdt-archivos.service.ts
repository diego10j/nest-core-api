import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { BDT_CONFIG } from './constants/base-tecnica.constants';
import { GetArchivosCargadosDto } from './dto/get-archivos-cargados.dto';
import { GetCoberturaProductosDto } from './dto/get-cobertura-productos.dto';

/** Tipos que un producto debería tener (los que duplican/faltan); OTRO y SIN_CLASIFICAR no cuentan. */
const TIPOS_BASE = `'FICHA_TECNICA', 'CERTIFICADO_ANALISIS', 'HOJA_SEGURIDAD'`;
const FORMATO_FECHA_HORA = `'YYYY-MM-DD HH24:MI:SS'`;

const lista = (exts: string[]) => exts.map((e) => `'${e}'`).join(', ');
const EXTENSIONES = lista(BDT_CONFIG.EXTENSIONES_SOPORTADAS);
const EXT_IMAGEN = lista(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'tif', 'tiff', 'heic']);
const EXT_VIDEO = lista(['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v']);
const EXT_OFFICE = lista(['doc', 'docx', 'xls', 'xlsx', 'xlsm', 'csv', 'ppt', 'pptx', 'txt', 'odt', 'ods', 'rtf']);
const EXT_COMPRIMIDO = lista(['zip', 'rar', '7z', 'gz', 'tar']);

/**
 * Tipo probable de un adjunto solo por su nombre (mismas reglas que clasificarPorNombre del clasificador),
 * para los archivos que aún no se extrajeron a la base técnica. NULL = no se reconoce.
 */
function sqlTipoPorNombre(col: string): string {
  const n = `regexp_replace(translate(upper(${col}), 'ÁÉÍÓÚÑ', 'AEIOUN'), '[-_.]+', ' ', 'g')`;
  return `CASE
      WHEN ${n} ~ '\\y(M?SDS|HDS|FDS|HOJAS? DE (DATOS DE )?SEGURIDAD|FICHA DE (DATOS DE )?SEGURIDAD|SAFETY)\\y' THEN 'HOJA_SEGURIDAD'
      WHEN ${n} ~ '\\y(COA|C O A|CERTIFICADO|CERTIFICATE|ANALISIS|ANALYSIS|LOTE|BATCH|LOT)\\y' THEN 'CERTIFICADO_ANALISIS'
      WHEN ${n} ~ '\\y(FT|F T|TDS|FICHA|FICHA TECNICA|HOJA TECNICA|TECHNICAL|SPEC|SPECIFICATION|ESPECIFICACION(ES)?|DATA SHEET)\\y' THEN 'FICHA_TECNICA'
    END`;
}

const partes = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Página "Archivos cargados": control de los adjuntos de todos los productos que alimentan la base técnica —
 * qué se subió y cuándo, qué tipo es (ficha técnica, COA, hoja de seguridad), cuáles se repiten y qué productos
 * activos no tienen documentación. Solo lectura: eliminar reutiliza el flujo del explorador de archivos.
 */
@Injectable()
export class BdtArchivosService {
  constructor(private readonly dataSource: DataSourceService) {}

  /**
   * Un registro por archivo (no carpeta, sin papelera) de un producto, en cualquier subcarpeta. Atribuye el
   * producto por la carpeta raíz (igual que la extracción masiva) y agrega:
   *  - tipo: el de la base técnica si ya se extrajo; si no, el deducido del nombre; si no, SIN_CLASIFICAR.
   *  - copias_tipo / orden_tipo: cuántos archivos del mismo tipo tiene el producto y el lugar de este
   *    (1 = el más reciente por FECHA DE CARGA). Solo ficha/COA/hoja. La fecha del documento y la de
   *    vencimiento (leídas por la base técnica) son solo informativas, no intervienen en el orden.
   *  - formato: PDF, IMAGEN, VIDEO, OFFICE, COMPRIMIDO u OTRO según la extensión.
   *  - compartido_en: en cuántos productos está el mismo archivo físico ("Reutilizar documento").
   */
  private sqlArchivos(ideEmpr: number): string {
    return `
      WITH RECURSIVE arbol AS (
        SELECT a.ide_arch, a.carpeta_arch, a.ide_inarti,
               -- ::text: en un CTE recursivo el tipo del término base debe coincidir con el del recursivo (||).
               (CASE WHEN a.carpeta_arch THEN a.nombre_arch ELSE '' END)::text AS ruta, 1 AS nivel
          FROM sis_archivo a
         WHERE a.ide_empr = ${Number(ideEmpr)} AND a.sis_ide_arch IS NULL AND a.ide_inarti IS NOT NULL
           AND COALESCE(a.papelera_arch, FALSE) = FALSE
        UNION ALL
        SELECT h.ide_arch, h.carpeta_arch, p.ide_inarti,
               CASE WHEN h.carpeta_arch THEN p.ruta || '/' || h.nombre_arch ELSE p.ruta END, p.nivel + 1
          FROM sis_archivo h
          JOIN arbol p ON h.sis_ide_arch = p.ide_arch AND p.carpeta_arch = TRUE
         WHERE COALESCE(h.papelera_arch, FALSE) = FALSE AND p.nivel < 20
      ),
      crudo AS (
        SELECT t.ide_inarti, t.ruta, a.ide_arch, a.uuid::text AS uuid, a.nombre_arch, a.nombre2_arch,
               lower(substring(a.nombre_arch from '\\.([^.]+)$')) AS ext,
               COALESCE(a.peso_arch, 0)::bigint AS peso_arch, a.usuario_ingre,
               (a.fecha_ingre + COALESCE(a.hora_ingre, TIME '00:00')) AS fecha_carga,
               COALESCE(a.descargas_arch, 0) AS descargas,
               (to_jsonb(a) ->> 'marca_agua_arch') IS NOT NULL AS marca_agua,
               d.ide_bddoc, d.tipo_bddoc, d.estado_bddoc, d.confianza_bddoc,
               d.fecha_referencia_bddoc::timestamp AS fecha_documento,
               d.fecha_vencimiento_bddoc::timestamp AS fecha_vencimiento,
               ${sqlTipoPorNombre('a.nombre_arch')} AS tipo_nombre
          FROM arbol t
          JOIN sis_archivo a ON a.ide_arch = t.ide_arch AND a.carpeta_arch = FALSE
          LEFT JOIN LATERAL (
            SELECT x.ide_bddoc, x.tipo_bddoc, x.estado_bddoc, x.confianza_bddoc, x.fecha_referencia_bddoc,
                   x.fecha_vencimiento_bddoc
              FROM bdt_documento x
             WHERE x.uuid_origen_bddoc = a.uuid AND x.ide_empr = a.ide_empr
             ORDER BY x.ide_bddoc DESC LIMIT 1
          ) d ON TRUE
      ),
      base AS (
        SELECT c.*, COALESCE(c.tipo_bddoc, c.tipo_nombre, 'SIN_CLASIFICAR') AS tipo,
               CASE WHEN c.ide_bddoc IS NOT NULL THEN 'EXTRAIDO'
                    WHEN c.ext IN (${EXTENSIONES}) THEN 'SIN_EXTRAER'
                    ELSE 'NO_APLICA' END AS extraccion,
               CASE WHEN c.ext = 'pdf' THEN 'PDF'
                    WHEN c.ext IN (${EXT_IMAGEN}) THEN 'IMAGEN'
                    WHEN c.ext IN (${EXT_VIDEO}) THEN 'VIDEO'
                    WHEN c.ext IN (${EXT_OFFICE}) THEN 'OFFICE'
                    WHEN c.ext IN (${EXT_COMPRIMIDO}) THEN 'COMPRIMIDO'
                    ELSE 'OTRO' END AS formato
          FROM crudo c
      )
      SELECT b.*,
             CASE WHEN b.tipo IN (${TIPOS_BASE}) THEN COUNT(*) OVER (PARTITION BY b.ide_inarti, b.tipo) END AS copias_tipo,
             CASE WHEN b.tipo IN (${TIPOS_BASE}) THEN ROW_NUMBER() OVER (
                    PARTITION BY b.ide_inarti, b.tipo
                    ORDER BY b.fecha_carga DESC, b.ide_arch DESC) END AS orden_tipo,
             CASE WHEN b.nombre2_arch IS NULL THEN 1 ELSE COUNT(*) OVER (PARTITION BY b.nombre2_arch) END AS compartido_en
        FROM base b`;
  }

  /** Un registro por producto con cuántos archivos tiene de cada tipo. */
  private sqlCobertura(ideEmpr: number, incluirInactivos: boolean): string {
    return `
      SELECT p.ide_inarti, p.uuid::text AS uuid_inarti, p.nombre_inarti, p.codigo_inarti, c.nombre_incate, p.ide_incate,
             COALESCE(p.activo_inarti, TRUE) AS activo,
             COUNT(f.ide_arch)::int AS total_archivos,
             COUNT(*) FILTER (WHERE f.tipo = 'FICHA_TECNICA')::int AS fichas,
             COUNT(*) FILTER (WHERE f.tipo = 'CERTIFICADO_ANALISIS')::int AS coas,
             COUNT(*) FILTER (WHERE f.tipo = 'HOJA_SEGURIDAD')::int AS hojas,
             COUNT(*) FILTER (WHERE f.tipo IN ('OTRO', 'SIN_CLASIFICAR'))::int AS otros,
             COALESCE(SUM(f.peso_arch), 0)::bigint AS peso_total,
             to_char(MAX(f.fecha_carga), ${FORMATO_FECHA_HORA}) AS ultima_carga,
             to_char(MAX(f.fecha_carga) FILTER (WHERE f.tipo = 'CERTIFICADO_ANALISIS'), ${FORMATO_FECHA_HORA}) AS ultimo_coa
        FROM inv_articulo p
        LEFT JOIN inv_categoria c ON c.ide_incate = p.ide_incate
        LEFT JOIN (${this.sqlArchivos(ideEmpr)}) f ON f.ide_inarti = p.ide_inarti
       WHERE p.ide_empr = ${Number(ideEmpr)} ${incluirInactivos ? '' : 'AND COALESCE(p.activo_inarti, TRUE)'}
       GROUP BY p.ide_inarti, p.uuid, p.nombre_inarti, p.codigo_inarti, c.nombre_incate, p.ide_incate, p.activo_inarti`;
  }

  /** Listado de archivos (DataTableQuery: paginación, orden y búsqueda global) con filtros. */
  async getArchivosCargados(dto: GetArchivosCargadosDto & HeaderParamsDto) {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const cond: string[] = [];
    if (dto.incluirInactivos !== 'true') cond.push('COALESCE(p.activo_inarti, TRUE)');
    if (partes(dto.tipos).length) cond.push(`f.tipo = ANY(${p(partes(dto.tipos))}::text[])`);
    if (partes(dto.formatos).length) cond.push(`f.formato = ANY(${p(partes(dto.formatos))}::text[])`);
    if (partes(dto.categorias).length) cond.push(`p.ide_incate = ANY(${p(partes(dto.categorias).map(Number))}::int[])`);
    if (dto.fechaDesde) cond.push(`f.fecha_carga >= ${p(dto.fechaDesde)}::date`);
    if (dto.fechaHasta) cond.push(`f.fecha_carga < ${p(dto.fechaHasta)}::date + 1`);
    if (dto.extraccion === 'EXTRAIDO') cond.push('f.ide_bddoc IS NOT NULL');
    if (dto.extraccion === 'SIN_EXTRAER') cond.push(`f.extraccion = 'SIN_EXTRAER'`);
    if (dto.vista === 'DUPLICADOS') cond.push('f.copias_tipo > 1');
    if (dto.vista === 'ANTIGUOS') cond.push('f.orden_tipo > 1');
    if (dto.vista === 'COMPARTIDOS') cond.push('f.compartido_en > 1');

    // Duplicados/antiguos se leen por grupo (producto → tipo → del más reciente al más viejo).
    const orden =
      dto.vista === 'DUPLICADOS' || dto.vista === 'ANTIGUOS'
        ? 'p.nombre_inarti, f.tipo, f.orden_tipo'
        : 'f.fecha_carga DESC, f.ide_arch DESC';

    const q = new SelectQuery(
      `SELECT f.ide_arch, f.uuid, f.ide_inarti, p.uuid::text AS uuid_inarti, p.nombre_inarti, p.codigo_inarti, cat.nombre_incate,
              COALESCE(p.activo_inarti, TRUE) AS activo, f.nombre_arch, f.ext, f.peso_arch, f.tipo, f.extraccion,
              f.formato, f.estado_bddoc, f.confianza_bddoc, f.ide_bddoc, f.fecha_documento::date::text AS fecha_documento,
              f.fecha_vencimiento::date::text AS fecha_vencimiento,
              to_char(f.fecha_carga, ${FORMATO_FECHA_HORA}) AS fecha_carga, f.usuario_ingre, f.ruta, f.descargas,
              f.marca_agua, f.copias_tipo::int AS copias_tipo, f.orden_tipo::int AS orden_tipo,
              f.compartido_en::int AS compartido_en
         FROM (${this.sqlArchivos(dto.ideEmpr)}) f
         JOIN inv_articulo p ON p.ide_inarti = f.ide_inarti AND p.ide_empr = ${Number(dto.ideEmpr)}
         LEFT JOIN inv_categoria cat ON cat.ide_incate = p.ide_incate
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY ${orden}`,
      dto,
    );
    params.forEach((v, i) => q.addParam(i + 1, v));
    return this.dataSource.createQuery(q);
  }

  /** Cobertura documental por producto (DataTableQuery): qué tiene cada producto y qué le falta. */
  async getCoberturaProductos(dto: GetCoberturaProductosDto & HeaderParamsDto) {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const cond: string[] = [];
    if (partes(dto.categorias).length) cond.push(`x.ide_incate = ANY(${p(partes(dto.categorias).map(Number))}::int[])`);
    const cobertura: Record<string, string> = {
      SIN_ARCHIVOS: 'x.total_archivos = 0',
      SIN_FICHA: 'x.fichas = 0',
      SIN_COA: 'x.coas = 0',
      SIN_SDS: 'x.hojas = 0',
      INCOMPLETO: '(x.fichas = 0 OR x.coas = 0 OR x.hojas = 0)',
      COMPLETO: '(x.fichas > 0 AND x.coas > 0 AND x.hojas > 0)',
      DUPLICADOS: '(x.fichas > 1 OR x.coas > 1 OR x.hojas > 1)',
    };
    if (dto.cobertura) cond.push(cobertura[dto.cobertura]);

    const q = new SelectQuery(
      `SELECT x.ide_inarti, x.uuid_inarti, x.nombre_inarti, x.codigo_inarti, x.nombre_incate, x.activo, x.total_archivos,
              x.fichas, x.coas, x.hojas, x.otros, x.peso_total, x.ultima_carga, x.ultimo_coa
         FROM (${this.sqlCobertura(dto.ideEmpr, dto.incluirInactivos === 'true')}) x
        ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
        ORDER BY x.total_archivos, x.nombre_inarti`,
      dto,
    );
    params.forEach((v, i) => q.addParam(i + 1, v));
    return this.dataSource.createQuery(q);
  }

  /**
   * Datos del dashboard (archivos de productos activos): distribución por tipo de documento y por formato
   * (cantidad y peso), rankings (más pesados, productos con más archivos, más descargados) y cargas por mes.
   * Una sola consulta: el árbol de carpetas se recorre una vez y todo se agrega sobre ese resultado.
   */
  async getDashboardArchivos(dto: HeaderParamsDto) {
    const agg = (select: string, orden: string) =>
      `(SELECT COALESCE(json_agg(t ORDER BY ${orden}), '[]'::json) FROM (${select}) t)`;
    const r = await this.dataSource.pool.query(
      `WITH f AS (
         SELECT x.*, p.nombre_inarti, p.uuid::text AS uuid_inarti
           FROM (${this.sqlArchivos(dto.ideEmpr)}) x
           JOIN inv_articulo p ON p.ide_inarti = x.ide_inarti AND p.ide_empr = ${Number(dto.ideEmpr)}
          WHERE COALESCE(p.activo_inarti, TRUE)
       )
       SELECT
         ${agg(
           `SELECT tipo, COUNT(*)::int AS archivos, COALESCE(SUM(peso_arch), 0)::bigint AS peso FROM f GROUP BY tipo`,
           't.archivos DESC',
         )} AS por_tipo,
         ${agg(
           `SELECT formato, COUNT(*)::int AS archivos, COALESCE(SUM(peso_arch), 0)::bigint AS peso FROM f GROUP BY formato`,
           't.peso DESC',
         )} AS por_formato,
         ${agg(
           `SELECT ide_arch, uuid, nombre_arch, ext, peso_arch, ide_inarti, uuid_inarti, nombre_inarti, tipo FROM f
             ORDER BY peso_arch DESC, ide_arch LIMIT 10`,
           't.peso_arch DESC, t.ide_arch',
         )} AS mas_pesados,
         ${agg(
           `SELECT ide_inarti, uuid_inarti, nombre_inarti, COUNT(*)::int AS archivos, COALESCE(SUM(peso_arch), 0)::bigint AS peso,
                   COUNT(*) FILTER (WHERE tipo = 'FICHA_TECNICA')::int AS fichas,
                   COUNT(*) FILTER (WHERE tipo = 'CERTIFICADO_ANALISIS')::int AS coas,
                   COUNT(*) FILTER (WHERE tipo = 'HOJA_SEGURIDAD')::int AS hojas
              FROM f GROUP BY ide_inarti, uuid_inarti, nombre_inarti
             ORDER BY archivos DESC, peso DESC, nombre_inarti LIMIT 10`,
           't.archivos DESC, t.peso DESC, t.nombre_inarti',
         )} AS productos_top,
         ${agg(
           `SELECT ide_arch, uuid, nombre_arch, ext, descargas, ide_inarti, uuid_inarti, nombre_inarti, tipo FROM f
             WHERE descargas > 0 ORDER BY descargas DESC, ide_arch LIMIT 10`,
           't.descargas DESC, t.ide_arch',
         )} AS mas_descargados,
         ${agg(
           `SELECT to_char(date_trunc('month', fecha_carga), 'YYYY-MM') AS mes, COUNT(*)::int AS archivos,
                   COALESCE(SUM(peso_arch), 0)::bigint AS peso
              FROM f WHERE fecha_carga >= date_trunc('month', CURRENT_DATE) - interval '11 months'
             GROUP BY 1`,
           't.mes',
         )} AS cargas_mes,
         (SELECT COALESCE(SUM(descargas), 0)::bigint FROM f) AS total_descargas`,
    );
    const d = r.rows[0];
    return {
      porTipo: d.por_tipo,
      porFormato: d.por_formato,
      masPesados: d.mas_pesados,
      productosTop: d.productos_top,
      masDescargados: d.mas_descargados,
      cargasMes: d.cargas_mes,
      totalDescargas: Number(d.total_descargas) || 0,
    };
  }

  /** Totales para las tarjetas (archivos de productos activos). */
  async getResumenArchivos(dto: HeaderParamsDto) {
    const [archivos, productos] = await Promise.all([
      this.dataSource.pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(f.peso_arch), 0) AS peso_total,
                COUNT(*) FILTER (WHERE f.tipo = 'FICHA_TECNICA') AS fichas,
                COUNT(*) FILTER (WHERE f.tipo = 'CERTIFICADO_ANALISIS') AS coas,
                COUNT(*) FILTER (WHERE f.tipo = 'HOJA_SEGURIDAD') AS hojas,
                COUNT(*) FILTER (WHERE f.tipo = 'OTRO') AS otros,
                COUNT(*) FILTER (WHERE f.tipo = 'SIN_CLASIFICAR') AS sin_clasificar,
                COUNT(*) FILTER (WHERE f.extraccion = 'SIN_EXTRAER') AS sin_extraer,
                COUNT(*) FILTER (WHERE f.orden_tipo > 1) AS antiguos,
                COALESCE(SUM(f.peso_arch) FILTER (WHERE f.orden_tipo > 1), 0) AS peso_antiguos,
                COUNT(DISTINCT f.ide_inarti) FILTER (WHERE f.copias_tipo > 1) AS productos_con_duplicados,
                COUNT(*) FILTER (WHERE f.compartido_en > 1) AS compartidos,
                COUNT(*) FILTER (WHERE f.fecha_carga >= CURRENT_DATE - 6) AS ultimos_7_dias,
                COUNT(*) FILTER (WHERE f.fecha_carga >= CURRENT_DATE - 29) AS ultimos_30_dias
           FROM (${this.sqlArchivos(dto.ideEmpr)}) f
           JOIN inv_articulo p ON p.ide_inarti = f.ide_inarti AND p.ide_empr = ${Number(dto.ideEmpr)}
          WHERE COALESCE(p.activo_inarti, TRUE)`,
      ),
      this.dataSource.pool.query(
        `SELECT COUNT(*) AS activos,
                COUNT(*) FILTER (WHERE x.total_archivos = 0) AS sin_archivos,
                COUNT(*) FILTER (WHERE x.fichas = 0) AS sin_ficha,
                COUNT(*) FILTER (WHERE x.coas = 0) AS sin_coa,
                COUNT(*) FILTER (WHERE x.hojas = 0) AS sin_hoja,
                COUNT(*) FILTER (WHERE x.fichas > 0 AND x.coas > 0 AND x.hojas > 0) AS completos
           FROM (${this.sqlCobertura(dto.ideEmpr, false)}) x`,
      ),
    ]);
    const a = archivos.rows[0];
    const pr = productos.rows[0];
    const n = (v: unknown) => Number(v) || 0;
    return {
      total: n(a.total),
      pesoTotal: n(a.peso_total),
      fichas: n(a.fichas),
      coas: n(a.coas),
      hojas: n(a.hojas),
      otros: n(a.otros),
      sinClasificar: n(a.sin_clasificar),
      sinExtraer: n(a.sin_extraer),
      antiguos: n(a.antiguos),
      pesoAntiguos: n(a.peso_antiguos),
      productosConDuplicados: n(a.productos_con_duplicados),
      compartidos: n(a.compartidos),
      ultimos7Dias: n(a.ultimos_7_dias),
      ultimos30Dias: n(a.ultimos_30_dias),
      productosActivos: n(pr.activos),
      productosSinArchivos: n(pr.sin_archivos),
      productosSinFicha: n(pr.sin_ficha),
      productosSinCoa: n(pr.sin_coa),
      productosSinHoja: n(pr.sin_hoja),
      productosCompletos: n(pr.completos),
    };
  }
}
