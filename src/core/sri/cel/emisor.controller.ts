import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { EmisorService } from './emisor.service';

@Controller('sri/cel/emisor')
export class EmisorController {
    constructor(private readonly service: EmisorService) { }


    @Get('getEmisor')
    // @Auth()
    getEmisor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto
    ) {
        return this.service.getEmisor({
            ...headersParams,
            ...dtoIn
        });
    }


    @Post('clearCacheEmisor')
    // @Auth()
    clearCacheEmisor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: QueryOptionsDto
    ) {
        return this.service.clearCacheEmisor({
            ...headersParams,
            ...dtoIn
        });
    }


}