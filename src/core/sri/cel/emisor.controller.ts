import { Body, Controller, Post } from '@nestjs/common';
import { ServiceDto } from 'src/common/dto/service.dto';
import { EmisorService } from './emisor.service';

@Controller('sri/cel/emisor')
export class EmisorController {
    constructor(private readonly service: EmisorService) { }


    @Post('getEmisor')
    // @Auth()
    getEmisor(
        @Body() dtoIn: ServiceDto
    ) {
        return this.service.getEmisor(dtoIn);
    }


    @Post('clearCacheEmisor')
    // @Auth()
    clearCacheEmisor(
        @Body() dtoIn: ServiceDto
    ) {
        return this.service.clearCacheEmisor(dtoIn);
    }


}