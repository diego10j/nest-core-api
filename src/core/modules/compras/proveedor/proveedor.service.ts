import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { normalizeString } from 'src/util/helpers/sql-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

@Injectable()
export class ProveedorService extends BaseService {
  constructor(private readonly dataSource: DataSourceService) {
    super();
  }

  async searchProveedor(dto: SearchDto & HeaderParamsDto) {
    if (dto.value === '') {
      return [];
    }

    const normalizedSearchValue = normalizeString(dto.value.trim());
    const sqlSearchValue = `%${normalizedSearchValue}%`;

    const query = new SelectQuery(
      `
    SELECT
        p.ide_geper,
        p.uuid,
        p.identificac_geper,
        p.nom_geper,
        p.correo_geper,
        CASE
            WHEN regexp_replace(unaccent(LOWER(COALESCE(ti.nombre_getid, ''))), '[^a-z0-9]', '', 'g') LIKE '%cedula%' THEN 'CEDULA'
            WHEN regexp_replace(unaccent(LOWER(COALESCE(ti.nombre_getid, ''))), '[^a-z0-9]', '', 'g') LIKE '%ruc%' THEN 'RUC'
            WHEN regexp_replace(unaccent(LOWER(COALESCE(ti.nombre_getid, ''))), '[^a-z0-9]', '', 'g') LIKE '%pasaporte%' THEN 'PASAPORTE'
            ELSE COALESCE(ti.nombre_getid, '')
        END AS tipo_identificacion,
        COALESCE(tp.detalle_getip, '') AS tipo_persona,
        p.ide_getid,
        p.ide_getip,
        prov.ide_geprov,
        prov.nombre_geprov,
        p.direccion_geper,
        p.telefono_geper,
        p.fecha_ingre_geper
    FROM
        gen_persona p
        LEFT JOIN gen_tipo_identifi ti ON p.ide_getid = ti.ide_getid
        LEFT JOIN gen_tipo_persona tp ON p.ide_getip = tp.ide_getip
        LEFT JOIN gen_provincia prov ON p.ide_geprov = prov.ide_geprov
    WHERE
        (
            regexp_replace(unaccent(LOWER(p.nom_geper)), '[^a-z0-9]', '', 'g') LIKE $1
            OR regexp_replace(unaccent(LOWER(p.identificac_geper)), '[^a-z0-9]', '', 'g') LIKE $2
            OR regexp_replace(unaccent(LOWER(p.correo_geper)), '[^a-z0-9]', '', 'g') LIKE $3
        )
        AND p.ide_empr = ${dto.ideEmpr}
        AND p.activo_geper = true
        and p.es_proveedo_geper = true
        AND p.nivel_geper = 'HIJO'
    ORDER BY
        p.nom_geper
    LIMIT ${dto.limit}
    `,
      dto,
    );
    query.addStringParam(1, sqlSearchValue);
    query.addStringParam(2, sqlSearchValue);
    query.addStringParam(3, sqlSearchValue);
    return this.dataSource.createSelectQuery(query);
  }
}
