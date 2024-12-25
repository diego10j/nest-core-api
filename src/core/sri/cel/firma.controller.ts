import { Body, Controller, Post } from '@nestjs/common';
import { ServiceDto } from 'src/common/dto/service.dto';
import { FirmaService } from './firma.service';

@Controller('sri/cel/firma')
export class FirmaController {
    constructor(private readonly service: FirmaService) { }


    @Post('getFirma')
    // @Auth()
    getCliente(
        @Body() dtoIn: ServiceDto
    ) {
        return this.service.getFirma(dtoIn);
    }

    @Post('getFirmas')
    // @Auth()
    getFirmas(
        @Body() dtoIn: ServiceDto
    ) {
        return this.service.getFirmas(dtoIn);
    }


    @Post('clearCacheFirma')
    // @Auth()
    clearCacheFirma(
        @Body() dtoIn: ServiceDto
    ) {
        return this.service.clearCacheFirma(dtoIn);
    }


}