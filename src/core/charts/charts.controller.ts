import { Body, Controller, Post } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { RadialBarDto } from './dto/radial-bar.dto';


@Controller('charts')
export class ChartsController {
    constructor(private readonly service: ChartsService) { }

    @Post('radialBar')
    // @Auth()
    radialBar(
        @Body() dtoIn: RadialBarDto
    ) {
        return this.service.radialBar(dtoIn);
    }

    @Post('pie')
    // @Auth()
    pie(
        @Body() dtoIn: RadialBarDto
    ) {
        return this.service.radialBar(dtoIn);
    }

    @Post('donut')
    // @Auth()
    donut(
        @Body() dtoIn: RadialBarDto
    ) {
        return this.service.radialBar(dtoIn);
    }


}