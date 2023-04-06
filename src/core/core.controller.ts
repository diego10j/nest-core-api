import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from './auth/decorators';
import { SelectDataValuesDto } from './connection/dto/list-data.dto';
import { CoreService } from './core.service';

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

}
