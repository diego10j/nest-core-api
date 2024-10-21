import { Injectable } from '@nestjs/common';
import { ServiceDto } from 'src/common/dto/service.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { OpcionDto } from './dto/opcion.dto';
import { PerfilDto } from './dto/perfil.dto';
import { SelectQuery } from 'src/core/connection/helpers';

@Injectable()
export class AdminService {

    constructor(private readonly dataSource: DataSourceService,
        private readonly core: CoreService) { }


    // -------------------------------- EMPRESA ---------------------------- //
    async getListDataEmpresa(dto: ServiceDto) {
        const dtoIn = { ...dto, tableName: 'sis_empresa', primaryKey: 'ide_empr', columnLabel: 'nom_empr' }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQueryEmpresa(dto: ServiceDto) {
        const dtoIn = { ...dto, tableName: 'sis_empresa', primaryKey: 'ide_empr' }
        return this.core.getTableQuery(dtoIn);
    }

    // -------------------------------- SUCURSAL ---------------------------- //
    async getListDataSucursal(dto: ServiceDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, tableName: 'sis_sucursal', primaryKey: 'ide_sucu', columnLabel: 'nom_sucu', condition }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQuerySucursal(dto: ServiceDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, tableName: 'sis_sucursal', primaryKey: 'ide_sucu', condition }
        return this.core.getTableQuery(dtoIn);
    }


    // -------------------------------- SISTEMAS ---------------------------- //
    async getListDataSistema(dto: ServiceDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, tableName: 'sis_sistema', primaryKey: 'ide_sist', columnLabel: 'nombre_sist', condition }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQuerySistema(dto: ServiceDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, tableName: 'sis_sistema', primaryKey: 'ide_sist', condition }
        return this.core.getTableQuery(dtoIn);
    }

    // -------------------------------- OPCIONES ---------------------------- //
    async getTableQueryOpcion(dto: OpcionDto) {
        const whereClause = `ide_sist = ${dto.ide_sist} AND ${isDefined(dto.sis_ide_opci) === false ? 'sis_ide_opci IS NULL' : `sis_ide_opci = ${dto.sis_ide_opci}`}`;
        const dtoIn = { ...dto, tableName: 'sis_opcion', primaryKey: 'ide_opci', condition: `${whereClause}`, orderBy: 'nom_opci' }
        return this.core.getTableQuery(dtoIn);
    }

    async getTreeModelOpcion(dto: OpcionDto) {
        const whereClause = `ide_sist = ${dto.ide_sist}`;
        const dtoIn = { ...dto, tableName: 'sis_opcion', primaryKey: 'ide_opci', columnName: 'nom_opci', columnNode: 'sis_ide_opci', condition: `${whereClause}`, orderBy: 'nom_opci' }
        return this.core.getTreeModel(dtoIn);
    }

    // -------------------------------- PERFILES ---------------------------- //
    async getTableQueryPerfil(dto: PerfilDto) {
        const whereClause = `ide_sist = ${dto.ide_sist}`;
        const dtoIn = { ...dto, tableName: 'sis_perfil', primaryKey: 'ide_perf', condition: `${whereClause}`, orderBy: 'nom_perf' }
        return this.core.getTableQuery(dtoIn);
    }

    async getPerfilesSistema(dtoIn: PerfilDto) {
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
    async getListDataTiposHorario(dto: ServiceDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, tableName: 'sis_tipo_horario', primaryKey: 'ide_tihor', columnLabel: 'nombre_tihor', condition }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQueryTiposHorario(dto: ServiceDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, tableName: 'sis_tipo_horario', primaryKey: 'ide_tihor', condition }
        return this.core.getTableQuery(dtoIn);
    }


    async getTableQueryHorario(dto: ServiceDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        const dtoIn = { ...dto, tableName: 'sis_horario', primaryKey: 'ide_hora', condition }
        return this.core.getTableQuery(dtoIn);
    }

}
