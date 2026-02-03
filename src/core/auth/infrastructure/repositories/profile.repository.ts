import { Injectable } from '@nestjs/common';

import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers';
import { IProfileRepository } from '../../domain/repositories/profile.repository.interface';
import { PerfilAuth } from '../../interfaces/auth-user.interface';

/**
 * Implementación del repositorio de perfiles
 */
@Injectable()
export class ProfileRepository implements IProfileRepository {
    constructor(private readonly dataSource: DataSourceService) { }

    async findByUserId(ideUsua: number): Promise<PerfilAuth[]> {
        const queryPerf = new SelectQuery(`
      SELECT
        a.ide_perf,
        nom_perf
      FROM
        sis_usuario_perfil a
        INNER JOIN sis_perfil b on a.ide_perf = b.ide_perf
      WHERE
        activo_perf = true
        AND activo_usper = true
        and a.ide_usua = $1
        and b.ide_sist = 2
    `);
        queryPerf.addIntParam(1, ideUsua);

        return this.dataSource.createSelectQuery(queryPerf);
    }
}
