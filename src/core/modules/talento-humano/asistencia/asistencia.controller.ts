import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AsistenciaService } from './asistencia.service';
import { GetMisMarcacionesDto } from './dto/asistencia.dto';

@ApiTags('TalentoHumano-Asistencia')
@Controller('talento-humano/asistencia')
export class AsistenciaController {
    constructor(private readonly service: AsistenciaService) { }

    @Get('getMisMarcaciones')
    @ApiOperation({ summary: 'Marcaciones del mes del empleado vinculado al usuario logueado (autoservicio)' })
    getMisMarcaciones(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetMisMarcacionesDto,
    ) {
        return this.service.getMisMarcaciones({ ...headersParams, ...dtoIn });
    }
}
