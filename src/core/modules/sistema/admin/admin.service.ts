import { BadRequestException, Injectable } from '@nestjs/common';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { OpcionDto } from './dto/opcion.dto';
import { PerfilDto } from './dto/perfil.dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { HorarioDto } from './dto/horario.dto';
import { RucDto } from './dto/ruc.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Injectable()
export class AdminService {

    constructor(private readonly dataSource: DataSourceService,
        private readonly core: CoreService) { }


    // -------------------------------- EMPRESA ---------------------------- //
    async getListDataEmpresa(dto: QueryOptionsDto & HeaderParamsDto) {
        const dtoIn = { ...dto, module: 'sis', tableName: 'empresa', primaryKey: 'ide_empr', columnLabel: 'nom_empr' }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQueryEmpresa(dto: QueryOptionsDto & HeaderParamsDto) {
        const dtoIn = { ...dto, module: 'sis', tableName: 'empresa', primaryKey: 'ide_empr' }
        return this.core.getTableQuery(dtoIn);
    }

    async getEmpresaByRuc(dtoIn: RucDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        select
            ide_empr,
            nom_empr,
            identificacion_empr,
            nom_corto_empr,
            mail_empr,
            logotipo_empr
        from
            sis_empresa
        where
            identificacion_empr = $1
            `);
        query.addStringParam(1, dtoIn.ruc);
        const res = await this.dataSource.createSingleQuery(query);
        if (res === null) {
            throw new BadRequestException(`La empresa no existe`);
        }
        return res
    }


    // -------------------------------- SUCURSAL ---------------------------- //
    async getListDataSucursal(dto: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'sucursal', primaryKey: 'ide_sucu', columnLabel: 'nom_sucu', condition }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQuerySucursal(dto: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'sucursal', primaryKey: 'ide_sucu', condition }
        return this.core.getTableQuery(dtoIn);
    }


    // -------------------------------- SISTEMAS ---------------------------- //
    async getListDataSistema(dto: QueryOptionsDto & HeaderParamsDto) {
        const dtoIn = { ...dto, module: 'sis', tableName: 'sistema', primaryKey: 'ide_sist', columnLabel: 'nombre_sist' }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQuerySistema(dto: QueryOptionsDto & HeaderParamsDto) {
        const dtoIn = { ...dto, module: 'sis', tableName: 'sistema', primaryKey: 'ide_sist' }
        return this.core.getTableQuery(dtoIn);
    }

    // -------------------------------- OPCIONES ---------------------------- //
    async getTableQueryOpcion(dto: OpcionDto & HeaderParamsDto) {
        const whereClause = `ide_sist = ${dto.ide_sist} AND ${isDefined(dto.sis_ide_opci) === false ? 'sis_ide_opci IS NULL' : `sis_ide_opci = ${dto.sis_ide_opci}`}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'opcion', primaryKey: 'ide_opci', condition: `${whereClause}`, orderBy: { column: 'nom_opci' }, }
        return this.core.getTableQuery(dtoIn);
    }

    async getTreeModelOpcion(dto: OpcionDto & HeaderParamsDto) {
        const whereClause = `ide_sist = ${dto.ide_sist}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'opcion', primaryKey: 'ide_opci', columnName: 'nom_opci', columnNode: 'sis_ide_opci', condition: `${whereClause}`, orderBy: { column: 'nom_opci' }, }
        return this.core.getTreeModel(dtoIn);
    }

    // -------------------------------- PERFILES ---------------------------- //
    async getTableQueryPerfil(dto: PerfilDto & HeaderParamsDto) {
        const whereClause = `ide_sist = ${dto.ide_sist}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'perfil', primaryKey: 'ide_perf', condition: `${whereClause}`, orderBy: { column: 'nom_perf' } }
        return this.core.getTableQuery(dtoIn);
    }

    async getPerfilesSistema(dtoIn: PerfilDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            a.ide_perf,
            nom_perf,
            nombre_corto_sist
        FROM
            sis_perfil a
            INNER JOIN sis_sistema b ON a.ide_sist = b.ide_sist
        WHERE
            a.ide_sist = $1
        ORDER BY
            nom_perf
            `, dtoIn);
        query.addIntParam(1, dtoIn.ide_sist);
        return await this.dataSource.createQuery(query);
    }




    // -------------------------------- HORARIOS ---------------------------- //
    async getListDataTiposHorario(dto: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'tipo_horario', primaryKey: 'ide_tihor', columnLabel: 'nombre_tihor', condition }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQueryTiposHorario(dto: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'tipo_horario', primaryKey: 'ide_tihor', condition }
        return this.core.getTableQuery(dtoIn);
    }


    async getTableQueryHorario(dto: HorarioDto  & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr} and ide_tihor=${dto.ide_tihor}`;
        const dtoIn = { ...dto, module: 'sis', tableName: 'horario', primaryKey: 'ide_hora', condition }
        return this.core.getTableQuery(dtoIn);
    }

}
