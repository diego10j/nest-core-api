import { Body, Controller, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ChartsService } from './charts.service';
import { RadialBarDto } from './dto/radial-bar.dto';

@ApiTags('Charts')
@Controller('charts')
export class ChartsController {
    constructor(private readonly service: ChartsService) { }

    @Post('radialBar')
    // @Auth()
    radialBar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RadialBarDto
    ) {
        return this.service.radialBar({
            ...headersParams,
            ...dtoIn
        });
    }

    @Post('pie')
    // @Auth()
    pie(
        @Body() dtoIn: RadialBarDto,
        @AppHeaders() headersParams: HeaderParamsDto,
    ) {
        return this.service.radialBar({
            ...headersParams,
            ...dtoIn
        });
    }

    @Post('donut')
    // @Auth()
    donut(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RadialBarDto
    ) {
        return this.service.radialBar({
            ...headersParams,
            ...dtoIn
        });
    }


}