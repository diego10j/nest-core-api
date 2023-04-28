import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from './auth/decorators';
import { SelectDataValuesDto } from './connection/dto/list-data.dto';
import { CoreService } from './core.service';
import { TableQueryDto } from './connection/dto/table-query.dto';
import { SaveObjectDto } from './connection/dto/save-object.dto';

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


    @Post('getSingleResultTable')
    //@Auth()
    getSingleResultTable(
        @Body() dtoIn: TableQueryDto
    ) {
        return this.service.getSingleResultTable(dtoIn);
    }


    @Post('saveOrUpdateObject')
    //@Auth()
    saveOrUpdateObject(
        @Body() dtoIn: SaveObjectDto
    ) {
        return this.service.saveOrUpdateObject(dtoIn);
    }


}
