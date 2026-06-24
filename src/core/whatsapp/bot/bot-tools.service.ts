import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

export interface ClienteInfo {
  ide_geper: number;
  nombres: string;
  correo: string;
  telefono?: string;
  identificacion: string;
}

export interface ProductoInfo {
  ide_inarti: number;
  nombre: string;
  otro_nombre?: string;
  desc_corta?: string;
  siglas_unidad: string;
  nombre_unidad: string;
  en_catalogo: boolean;
}

export interface PrecioConfigurado {
  precio_unitario: number;
  incluye_iva: boolean;
  cantidad_minima: number;
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
        identificac_geper AS identificacion
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
        ) AS en_catalogo
      FROM inv_articulo a
      LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
      WHERE a.ide_empr = $2
        AND a.activo_inarti = TRUE
        AND a.hace_kardex_inarti = TRUE
        AND (
          unaccent(UPPER(a.nombre_inarti))      ILIKE '%' || unaccent(UPPER($1)) || '%'
          OR unaccent(UPPER(COALESCE(a.otro_nombre_inarti,''))) ILIKE '%' || unaccent(UPPER($1)) || '%'
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

  async buscarPrecioConfigurado(ideInarti: number, cantidad: number, ideEmpr: number): Promise<PrecioConfigurado | null> {
    const q = new SelectQuery(`
      SELECT
        cp.precio_fijo_incpa  AS precio_unitario,
        cp.incluye_iva_incpa  AS incluye_iva,
        cp.rango1_cant_incpa  AS cantidad_minima
      FROM inv_conf_precios_articulo cp
      WHERE cp.ide_inarti = $1
        AND cp.precio_fijo_incpa IS NOT NULL
        AND cp.precio_fijo_incpa > 0
        AND (
          cp.rangos_incpa = FALSE AND cp.rango1_cant_incpa <= $2
          OR cp.rangos_incpa = TRUE
        )
      ORDER BY
        CASE WHEN cp.rangos_incpa = FALSE THEN cp.rango1_cant_incpa ELSE 0 END DESC
      LIMIT 1
    `);
    q.addIntParam(1, ideInarti);
    q.addIntParam(2, cantidad);
    return this.dataSource.createSingleQuery(q);
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
