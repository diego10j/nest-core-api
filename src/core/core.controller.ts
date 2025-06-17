import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Auth } from './auth/decorators';
import { CoreService } from './core.service';

import { TableQueryDto, SaveListDto, UniqueDto, DeleteDto, SeqTableDto, ListDataValuesDto, FindByUuidDto, FindByIdDto, UpdateColumnsDto } from './connection/dto';
import { ColumnsTableDto } from './connection/dto/columns-table.dto';
import { TreeDto } from './connection/dto/tree-dto';
import { SearchTableDto } from 'src/common/dto/search-table.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';


@Controller('core')
export class CoreController {

    constructor(private readonly service: CoreService) { }

    @Get('getListDataValues')
    //@Auth()
    getListDataValues(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ListDataValuesDto
    ) {
        return this.service.getListDataValues({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getTableQueryByUuid')
    //@Auth()
    getTableQueryByUuid(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: FindByUuidDto
    ) {
        return this.service.getTableQueryByUuid({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('getTableQueryById')
    //@Auth()
    getTableQueryById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: FindByIdDto
    ) {
        return this.service.getTableQueryById({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('getTableQuery')
    //@Auth()
    getTableQuery(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: TableQueryDto
    ) {
        return this.service.getTableQuery({
            ...headersParams,
            ...dtoIn
        });
    }


    @Post('save')
    //@Auth()
    save(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveListDto
    ) {
        return this.service.save({
            ...headersParams,
            ...dtoIn
        });
    }


    @Post('isUnique')
    //@Auth()
    isUnique(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: UniqueDto
    ) {
        return this.service.isUnique({
            ...headersParams,
            ...dtoIn
        });
    }


    @Post('canDelete')
    //@Auth()
    isDelete(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: DeleteDto
    ) {
        return this.service.canDelete({
            ...headersParams,
            ...dtoIn
        });
    }


    @Post('getSeqTable')
    //@Auth()
    getSeqTable(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SeqTableDto
    ) {
        return this.service.getSeqTable({
            ...headersParams,
            ...dtoIn
        });
    }


    @Get('findByUuid')
    //@Auth()
    findByUuid(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: FindByUuidDto
    ) {
        return this.service.findByUuid({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('findById')
    //@Auth()
    findById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: FindByIdDto
    ) {
        return this.service.findById({
            ...headersParams,
            ...dtoIn
        });
    }

    @Get('search')
    //@Auth()
    search(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: SearchTableDto
    ) {
        return this.service.search({
            ...headersParams,
            ...dtoIn
        });
    }



    @Get('getTableColumns')
    //@Auth()
    getTableColumns(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ColumnsTableDto
    ) {
        return this.service.getTableColumns({
            ...headersParams,
            ...dtoIn
        });
    }

    @Post('refreshTableColumns')
    //@Auth()
    refreshTableColumns(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ColumnsTableDto
    ) {
        return this.service.refreshTableColumns({
            ...headersParams,
            ...dtoIn
        });
    }


    @Post('clearCacheRedis')
    //@Auth()
    clearTableColumnsCache(  ) {
        return this.service.clearCacheRedis();
    }

    @Get('getTreeModel')
    //@Auth()
    getTreeModel(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: TreeDto
    ) {
        return this.service.getTreeModel({
            ...headersParams,
            ...dtoIn
        });
    }

    @Post('updateColumns')
    //@Auth()
    updateColumns(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: UpdateColumnsDto
    ) {
        return this.service.updateColumns({
            ...headersParams,
            ...dtoIn
        });
    }


}
