import { UsuarioDto } from './dto/usuario.dto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SelectQuery } from '../../connection/helpers/select-query';
import { DataSourceService } from '../../connection/datasource.service';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { CoreService } from '../../core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Injectable()
export class UsuariosService {


    constructor(private readonly dataSource: DataSourceService,
        private readonly core: CoreService) { }


    // -------------------------------- USUARIO ---------------------------- //
    async getListDataUsuario(dto: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'usuario', primaryKey: 'ide_usua', columnLabel: 'nom_usua', condition }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQueryUsuarioByUuid(dto: UsuarioDto & HeaderParamsDto) {
        let whereClause = `uuid = '${dto.uuid}'`;
        if (isDefined(dto.uuid) === false) {
            whereClause = `ide_usua = -1`;
        }

        const dtoIn = { ...dto, module: 'sis', tableName: 'usuario', primaryKey: 'ide_usua', condition: `${whereClause}` }
        return this.core.getTableQuery(dtoIn);
    }


    /**
    * Retorna el listado de Usuarios
    * @returns 
    */
    async getUsuarios(dtoIn?: QueryOptionsDto  & HeaderParamsDto) {
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
        fecha_reg_usua,
        mail_usua
    FROM
        sis_usuario a
        inner join sis_perfil b on a.ide_perf = b.ide_perf
    WHERE
        ide_empr = ${dtoIn.ideEmpr}
    ORDER BY
        nom_usua`,dtoIn);
        return await this.dataSource.createQuery(query);
    }

}
