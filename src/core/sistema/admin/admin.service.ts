import { Injectable } from '@nestjs/common';
import { ServiceDto } from 'src/common/dto/service.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { OpcionDto } from './dto/opcion.dto';

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
        const dtoIn = { ...dto, tableName: 'sis_sucursal', primaryKey: 'ide_sucu', columnLabel: 'nom_sucu', condition: `ide_empr = ${dto.ideEmpr}` }
        return this.core.getListDataValues(dtoIn);
    }

    async getTableQuerySucursal(dto: ServiceDto) {
        const dtoIn = { ...dto, tableName: 'sis_sucursal', primaryKey: 'ide_sucu', condition: `ide_empr = ${dto.ideEmpr}` }
        return this.core.getTableQuery(dtoIn);
    }


    // -------------------------------- SISTEMAS ---------------------------- //
    async getListDataSistema(dto: ServiceDto) {
        const dtoIn = { ...dto, tableName: 'sis_sistema', primaryKey: 'ide_sist', columnLabel: 'nombre_sist' }
        return this.core.getListDataValues(dtoIn);
    }
    
    async getTableQuerySistema(dto: ServiceDto) {
        const dtoIn = { ...dto, tableName: 'sis_sistema', primaryKey: 'ide_sist' }
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


}
