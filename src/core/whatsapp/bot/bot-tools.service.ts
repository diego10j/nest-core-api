import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

export interface ClienteInfo {
  ide_geper: number;
  nombres: string;
  correo: string;
  telefono?: string;
  identificacion: string;
  direccion?: string;
  ide_getid?: number;
  ide_vgven?: number;
}

export interface ProductoInfo {
  ide_inarti: number;
  nombre: string;
  otro_nombre?: string;
  desc_corta?: string;
  siglas_unidad: string;
  nombre_unidad: string;
  en_catalogo: boolean;
  matched_by_otro_nombre?: boolean;
}

export interface PrecioConfigurado {
  precio_venta_sin_iva: number;
  precio_venta_con_iva: number;
  porcentaje_iva: number;
  tipo_configuracion: string;
}

@Injectable()
export class BotToolsService {
  constructor(private readonly dataSource: DataSourceService) {}

  async buscarClientePorIdentificacion(identificacion: string, ideEmpr: number): Promise<ClienteInfo | null> {
    const q = new SelectQuery(`
      SELECT
        ide_geper,
        nom_geper         AS nombres,
        correo_geper      AS correo,
        telefono_geper    AS telefono,
        identificac_geper AS identificacion,
        direccion_geper   AS direccion,
        ide_getid,
        ide_vgven
      FROM gen_persona
      WHERE TRIM(identificac_geper) = $1
        AND ide_empr = $2
        AND es_cliente_geper = TRUE
        AND activo_geper = TRUE
      LIMIT 1
    `);
    q.addParam(1, identificacion.trim());
    q.addIntParam(2, ideEmpr);
    return this.dataSource.createSingleQuery(q);
  }

  async buscarProductos(texto: string, ideEmpr: number): Promise<ProductoInfo[]> {
    const q = new SelectQuery(`
      SELECT
        a.ide_inarti,
        a.nombre_inarti          AS nombre,
        a.otro_nombre_inarti     AS otro_nombre,
        a.desc_corta_inarti      AS desc_corta,
        COALESCE(u.siglas_inuni, 'UND')  AS siglas_unidad,
        COALESCE(u.nombre_inuni,  'Unidad') AS nombre_unidad,
        EXISTS (
          SELECT 1 FROM inv_det_catalogo dc
          WHERE dc.ide_inarti = a.ide_inarti
            AND dc.activo_indcat = TRUE
        ) AS en_catalogo,
        (
          unaccent(UPPER(COALESCE(a.otro_nombre_inarti,''))) = unaccent(UPPER($1))
          AND NOT (unaccent(UPPER(a.nombre_inarti)) ILIKE '%' || unaccent(UPPER($1)) || '%')
        ) AS matched_by_otro_nombre
      FROM inv_articulo a
      LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
      WHERE a.ide_empr = $2
        AND a.activo_inarti = TRUE
        AND a.hace_kardex_inarti = TRUE
        AND (
          -- nombre_inarti: coincidencia parcial (substring)
          unaccent(UPPER(a.nombre_inarti)) ILIKE '%' || unaccent(UPPER($1)) || '%'
          -- otro_nombre_inarti: coincidencia exacta (sin mayúsculas, sin tildes, sin %)
          OR unaccent(UPPER(COALESCE(a.otro_nombre_inarti,''))) = unaccent(UPPER($1))
        )
      ORDER BY
        CASE WHEN unaccent(UPPER(a.nombre_inarti)) = unaccent(UPPER($1)) THEN 0 ELSE 1 END,
        nombre_inarti
      LIMIT 10
    `);
    q.addParam(1, texto);
    q.addIntParam(2, ideEmpr);
    return this.dataSource.createSelectQuery(q);
  }

  async obtenerProductoPorId(ideInarti: number, ideEmpr: number): Promise<ProductoInfo | null> {
    const q = new SelectQuery(`
      SELECT
        a.ide_inarti,
        a.nombre_inarti          AS nombre,
        a.otro_nombre_inarti     AS otro_nombre,
        a.desc_corta_inarti      AS desc_corta,
        COALESCE(u.siglas_inuni, 'UND')    AS siglas_unidad,
        COALESCE(u.nombre_inuni, 'Unidad') AS nombre_unidad,
        EXISTS (
          SELECT 1 FROM inv_det_catalogo dc
          WHERE dc.ide_inarti = a.ide_inarti AND dc.activo_indcat = TRUE
        ) AS en_catalogo
      FROM inv_articulo a
      LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
      WHERE a.ide_inarti = $1
        AND a.ide_empr = $2
      LIMIT 1
    `);
    q.addIntParam(1, ideInarti);
    q.addIntParam(2, ideEmpr);
    return this.dataSource.createSingleQuery(q);
  }

  async buscarPrecioConfigurado(ideInarti: number, cantidad: number): Promise<PrecioConfigurado | null> {
    const q = new SelectQuery(`
      SELECT precio_venta_sin_iva, precio_venta_con_iva, porcentaje_iva, tipo_configuracion
      FROM f_calcula_precio_venta($1, $2, NULL, NULL)
    `);
    q.addIntParam(1, ideInarti);
    q.addParam(2, cantidad);
    const row = await this.dataSource.createSingleQuery(q);
    if (!row || row.precio_venta_sin_iva == null) return null;
    return row as PrecioConfigurado;
  }

  async getStockProducto(ideInarti: number, ideEmpr: number): Promise<number> {
    const q = new SelectQuery(`
      SELECT COALESCE(SUM(
        CASE WHEN tipo_movinv = 'E' THEN cantidad_inkar ELSE -cantidad_inkar END
      ), 0) AS saldo
      FROM inv_kardex
      WHERE ide_inarti = $1
        AND ide_empr = $2
        AND activo_inkar = TRUE
    `);
    q.addIntParam(1, ideInarti);
    q.addIntParam(2, ideEmpr);
    const row = await this.dataSource.createSingleQuery(q);
    return Number(row?.saldo ?? 0);
  }

  async getProvinciaId(nombre: string): Promise<number | null> {
    const q = new SelectQuery(`
      SELECT ide_geprov FROM gen_provincia
      WHERE UNACCENT(UPPER(nombre_geprov)) = UNACCENT(UPPER($1))
      LIMIT 1
    `);
    q.addParam(1, nombre);
    const row = await this.dataSource.createSingleQuery(q);
    return row?.ide_geprov ?? null;
  }

  private readonly STOP_WORDS = new Set([
    'de','la','el','los','las','un','una','para','con','del','al','lo','si',
    'por','que','en','y','o','a','su','se','es','son','hay','como','mas','pero',
    'este','esta','esto','ese','esa','cual','cuales','nos','les','le','me','mi',
  ]);

  async buscarProductosPorPalabras(texto: string, ideEmpr: number): Promise<ProductoInfo[]> {
    const significativas = texto
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.STOP_WORDS.has(w));

    if (!significativas.length) return [];

    // Construir condiciones OR: el nombre contiene ALGUNA de las palabras significativas
    // y al menos 2 de ellas deben coincidir (prioridad)
    const params: any[] = [ideEmpr];
    const conditions = significativas.map((w, i) => {
      params.push(w);
      const n = i + 2;
      return `(unaccent(UPPER(a.nombre_inarti)) ILIKE '%' || unaccent(UPPER($${n})) || '%' OR unaccent(UPPER(COALESCE(a.otro_nombre_inarti,''))) ILIKE '%' || unaccent(UPPER($${n})) || '%')`;
    });

    // Score: cuenta cuántas palabras coinciden
    const scoreExpr = conditions.map(c => `CASE WHEN ${c} THEN 1 ELSE 0 END`).join(' + ');

    const q = new SelectQuery(`
      SELECT
        a.ide_inarti,
        a.nombre_inarti          AS nombre,
        a.otro_nombre_inarti     AS otro_nombre,
        a.desc_corta_inarti      AS desc_corta,
        COALESCE(u.siglas_inuni, 'UND')    AS siglas_unidad,
        COALESCE(u.nombre_inuni, 'Unidad') AS nombre_unidad,
        EXISTS (
          SELECT 1 FROM inv_det_catalogo dc
          WHERE dc.ide_inarti = a.ide_inarti AND dc.activo_indcat = TRUE
        ) AS en_catalogo,
        (${scoreExpr}) AS score
      FROM inv_articulo a
      LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
      WHERE a.ide_empr = $1
        AND a.activo_inarti = TRUE
        AND a.hace_kardex_inarti = TRUE
        AND (${conditions.join(' OR ')})
      ORDER BY score DESC, nombre_inarti
      LIMIT 10
    `);
    params.forEach((p, i) => {
      if (i === 0) q.addIntParam(1, p);
      else q.addParam(i + 1, p);
    });
    const rows = await this.dataSource.createSelectQuery(q);
    return rows.filter((r: any) => r.score >= Math.min(2, significativas.length));
  }

  async getIdeEmprPorPhoneNumberId(phoneNumberId: string): Promise<number | null> {
    const cacheKey = `wha_empr:${phoneNumberId}`;
    const cached = await this.dataSource.redisClient.get(cacheKey);
    if (cached) return parseInt(cached, 10);

    const q = new SelectQuery(`
      SELECT ide_empr FROM wha_cuenta
      WHERE REPLACE(id_telefono_whcue, '+', '') = $1
        AND activo_whcue = TRUE
      LIMIT 1
    `);
    q.addParam(1, phoneNumberId);
    const row = await this.dataSource.createSingleQuery(q);
    if (!row) return null;
    await this.dataSource.redisClient.setex(cacheKey, 3600, String(row.ide_empr));
    return row.ide_empr as number;
  }
}
