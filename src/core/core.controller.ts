import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from './auth/decorators';
import { SelectDataValuesDto } from './connection/dto/list-data.dto';
import { CoreService } from './core.service';
import { TableQueryDto } from './connection/dto/table-query.dto';
import { SaveListDto } from './connection/dto/save-list.dto';
import { UniqueDto } from './connection/dto/unique.dto';
import { DeleteDto } from './connection/dto/detele.dto';

@Controller('core')
export class CoreController {

    constructor(private readonly service: CoreService) { }

    @Post('getListDataValues')
    //@Auth()
    getListDataValues(
        @Body() dtoIn: SelectDataValuesDto
    ) {
        return this.service.getListDataValues(dtoIn);
    }


    @Post('getResultQuery')
    //@Auth()
    getSingleResultTable(
        @Body() dtoIn: TableQueryDto
    ) {
        return this.service.getResultQuery(dtoIn);
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


    @Post('isDelete')
    //@Auth()
    isDelete(
        @Body() dtoIn: DeleteDto
    ) {
        return this.service.isDelete(dtoIn);
    }


}
