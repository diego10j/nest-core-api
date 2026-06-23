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
  unidad?: string;
}

export interface CantidadMinima {
  cantidad: number;
  unidad_medida: string;
  descripcion: string;
  precio_final: number;
}

@Injectable()
export class BotToolsService {
  constructor(private readonly dataSource: DataSourceService) {}

  async buscarClientePorIdentificacion(identificacion: string, ideEmpr: number): Promise<ClienteInfo | null> {
    const q = new SelectQuery(`
      SELECT
        ide_geper,
        nom_geper           AS nombres,
        correo_geper        AS correo,
        telefono_geper      AS telefono,
        identificac_geper   AS identificacion
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
        ide_inarti,
        nombre_inarti          AS nombre,
        otro_nombre_inarti     AS otro_nombre,
        COALESCE(u.siglas_inuni, u.nombre_inuni) AS unidad
      FROM inv_articulo a
      LEFT JOIN inv_unidad u ON a.ide_inuni = u.ide_inuni
      WHERE a.ide_empr = $2
        AND a.activo_inarti = TRUE
        AND a.hace_kardex_inarti = TRUE
        AND (
          unaccent(UPPER(a.nombre_inarti))      ILIKE '%' || unaccent(UPPER($1)) || '%'
          OR unaccent(UPPER(a.otro_nombre_inarti)) ILIKE '%' || unaccent(UPPER($1)) || '%'
        )
      ORDER BY nombre_inarti
      LIMIT 5
    `);
    q.addParam(1, texto);
    q.addIntParam(2, ideEmpr);
    return this.dataSource.createSelectQuery(q);
  }

  async buscarCantidadesMinimas(ideInarti: number, ideEmpr: number): Promise<CantidadMinima[]> {
    const q = new SelectQuery(`
      SELECT
        cdc.cantidad_incdc      AS cantidad,
        cdc.unidad_medida_incdc AS unidad_medida,
        cdc.descripcion_incdc   AS descripcion,
        COALESCE(
          ROUND(
            cdc.cantidad_incdc * (
              CASE
                WHEN cp.incluye_iva_incpa THEN cp.precio_fijo_incpa
                ELSE cp.precio_fijo_incpa * (1 + COALESCE((
                  SELECT porcentaje_cnpim
                  FROM con_porcen_impues
                  WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
                    AND activo_cnpim = TRUE
                  ORDER BY fecha_desde_cnpim DESC LIMIT 1
                ), 0.12))
              END
            ), 2
          ), 0
        ) AS precio_final
      FROM inv_cant_det_catalogo cdc
      LEFT JOIN LATERAL (
        SELECT precio_fijo_incpa, incluye_iva_incpa
        FROM inv_conf_precios_articulo cp2
        WHERE cp2.ide_inarti = cdc.ide_inarti
          AND cp2.precio_fijo_incpa IS NOT NULL
          AND cp2.precio_fijo_incpa > 0
          AND (
            cp2.rangos_incpa = FALSE AND cp2.rango1_cant_incpa = cdc.cantidad_incdc
            OR cp2.rangos_incpa = TRUE
          )
        ORDER BY cp2.rango1_cant_incpa ASC LIMIT 1
      ) cp ON TRUE
      WHERE cdc.ide_inarti = $1
      ORDER BY cdc.cantidad_incdc
    `);
    q.addIntParam(1, ideInarti);
    return this.dataSource.createSelectQuery(q);
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
