import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { isDefined } from 'src/util/helpers/common-util';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { CoreService } from '../../../core.service';

import { UsuarioDto } from './dto/usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) { }

  // -------------------------------- USUARIO ---------------------------- //
  async getListDataUsuario(dto: QueryOptionsDto & HeaderParamsDto) {
    const condition = `ide_empr = ${dto.ideEmpr}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'usuario',
      primaryKey: 'ide_usua',
      columnLabel: 'nom_usua',
      condition,
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getTableQueryUsuarioByUuid(dto: UsuarioDto & HeaderParamsDto) {
    let whereClause = `uuid = '${dto.uuid}'`;
    if (isDefined(dto.uuid) === false) {
      whereClause = `ide_usua = -1`;
    }

    const dtoIn = { ...dto, module: 'sis', tableName: 'usuario', primaryKey: 'ide_usua', condition: `${whereClause}` };
    return this.core.getTableQuery(dtoIn);
  }

  /**
   * Retorna el listado de Usuarios con sus perfiles
   * @returns
   */
  async getUsuarios(dtoIn?: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
    SELECT
        a.uuid,
        a.ide_usua,
        a.nom_usua,
        a.nick_usua,
        a.activo_usua,
        a.avatar_usua,
        a.bloqueado_usua,
        a.fecha_reg_usua,
        a.mail_usua,
        COALESCE(
          json_agg(c.nom_perf) FILTER (WHERE c.ide_perf IS NOT NULL),
          '[]'::json
        ) as perfiles
    FROM
        sis_usuario a
        LEFT JOIN sis_usuario_perfil b ON a.ide_usua = b.ide_usua AND b.activo_usper = true
        LEFT JOIN sis_perfil c ON b.ide_perf = c.ide_perf AND c.activo_perf = true AND c.ide_sist = 2
    WHERE
        a.ide_empr = ${dtoIn.ideEmpr}
    GROUP BY
        a.uuid, a.ide_usua, a.nom_usua, a.nick_usua, a.activo_usua, a.avatar_usua, a.bloqueado_usua, a.fecha_reg_usua, a.mail_usua
    ORDER BY
        a.nom_usua`,
      dtoIn,
    );
    return this.dataSource.createQuery(query);
  }
}
