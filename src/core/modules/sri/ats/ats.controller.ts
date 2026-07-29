import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { buildAtsXml } from './ats-xml.builder';
import { AtsService } from './ats.service';
import { AtsQueryDto } from './dto/ats.dto';

@ApiTags('SRI-ATS')
@Controller('sri/ats')
export class AtsController {
    constructor(private readonly service: AtsService) { }

    @Get('generar')
    @Auth()
    @ApiOperation({ summary: 'Generar el XML del Anexo Transaccional Simplificado (ATS) de un período' })
    async generar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: AtsQueryDto) {
        const anexo = await this.service.generarAnexo({ ...headersParams, ...dtoIn });
        const mes = String(dtoIn.mes).padStart(2, '0');
        return {
            nombre: `AT${mes}${dtoIn.anio}.xml`,
            xml: buildAtsXml(anexo),
        };
    }
}
