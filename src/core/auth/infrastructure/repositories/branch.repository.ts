import { Injectable } from '@nestjs/common';

import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers';
import { IBranchRepository } from '../../domain/repositories/branch.repository.interface';
import { SucursalAuth } from '../../interfaces/auth-user.interface';

/**
 * Implementación del repositorio de sucursales
 */
@Injectable()
export class BranchRepository implements IBranchRepository {
    constructor(private readonly dataSource: DataSourceService) { }

    async findByUserId(ideUsua: number): Promise<SucursalAuth[]> {
        const querySucu = new SelectQuery(`
      SELECT
        b.ide_sucu,
        nom_sucu,
        '' as logo_sucu
      FROM
        sis_usuario_sucursal a
        INNER JOIN sis_sucursal b on a.sis_ide_sucu = b.ide_sucu
      WHERE
        activo_ussu = true
        and a.ide_usua = $1
    `);
        querySucu.addIntParam(1, ideUsua);

        return this.dataSource.createSelectQuery(querySucu);
    }
}
