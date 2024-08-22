import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Auth } from './auth/decorators';
import { CoreService } from './core.service';

import { TableQueryDto, SaveListDto, UniqueDto, DeleteDto, SeqTableDto, ListDataValuesDto, FindByUuidDto, UpdateColumnsDto } from './connection/dto';
import { ColumnsTableDto } from './connection/dto/columns-table.dto';
import { ServiceDto } from '../common/dto/service.dto';
import { TreeDto } from './connection/dto/tree-dto';


@Controller('core')
export class CoreController {

    constructor(private readonly service: CoreService) { }

    @Post('getListDataValues')
    //@Auth()
    getListDataValues(
        @Body() dtoIn: ListDataValuesDto
    ) {
        return this.service.getListDataValues(dtoIn);
    }


    @Post('getTableQuery')
    //@Auth()
    getTableQuery(
        @Body() dtoIn: TableQueryDto
    ) {
        return this.service.getTableQuery(dtoIn);
    }


    @Post('save')
    //@Auth()
    save(
        @Body() dtoIn: SaveListDto
    ) {
        return this.service.save(dtoIn);
    }


    @Post('isUnique')
    //@Auth()
    isUnique(
        @Body() dtoIn: UniqueDto
    ) {
        return this.service.isUnique(dtoIn);
    }


    @Post('canDelete')
    //@Auth()
    isDelete(
        @Body() dtoIn: DeleteDto
    ) {
        return this.service.canDelete(dtoIn);
    }


    @Post('getSeqTable')
    //@Auth()
    getSeqTable(
        @Body() dtoIn: SeqTableDto
    ) {
        return this.service.getSeqTable(dtoIn);
    }


    @Post('findByUuid')
    //@Auth()
    findByUuid(
        @Body() dtoIn: FindByUuidDto
    ) {
        return this.service.findByUuid(dtoIn);
    }


    @Post('getTableColumns')
    //@Auth()
    getTableColumns(
        @Body() dtoIn: ColumnsTableDto
    ) {
        return this.service.getTableColumns(dtoIn);
    }

    @Post('refreshTableColumns')
    //@Auth()
    refreshTableColumns(
        @Body() dtoIn: ColumnsTableDto
    ) {
        return this.service.refreshTableColumns(dtoIn);
    }


    @Post('clearTableColumnsCache')
    //@Auth()
    clearTableColumnsCache(
        @Body() _dtoIn: ServiceDto
    ) {
        return this.service.clearTableColumnsCache();
    }

    @Post('getTreeModel')
    //@Auth()
    getTreeModel(
        @Body() dtoIn: TreeDto
    ) {
        return this.service.getTreeModel(dtoIn);
    }

    @Post('updateColumns')
    //@Auth()
    updateColumns(
        @Body() dtoIn: UpdateColumnsDto
    ) {
        return this.service.updateColumns(dtoIn);
    }


}
