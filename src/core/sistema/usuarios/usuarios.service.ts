import { Injectable } from '@nestjs/common';
import { SelectQuery } from '../../connection/helpers/select-query';
import { DataSourceService } from '../../connection/datasource.service';
import { ServiceDto } from '../../../common/dto/service.dto';

@Injectable()
export class UsuariosService {


    constructor(private readonly dataSource: DataSourceService) { }

    /**
    * Retorna el listado de Usuarios
    * @returns 
    */
    async getUsuarios(_dtoIn?: ServiceDto) {

        const query = new SelectQuery(`
    SELECT
        a.uuid,
        ide_usua,
        nom_usua,
        nick_usua,
        activo_usua,
        nom_perf,
        avatar_usua,
        bloqueado_usua,
        fecha_reg_usua
    FROM
        sis_usuario a
        inner join sis_perfil b on a.ide_perf = b.ide_perf
    ORDER BY
        nom_usua`);
        return await this.dataSource.createQuery(query);
    }

}
