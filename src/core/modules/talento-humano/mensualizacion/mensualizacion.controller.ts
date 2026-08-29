import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetSolicitudesByEmpleadoDto, SaveSolicitudMensualizacionDto } from './dto/mensualizacion.dto';
import { MensualizacionService } from './mensualizacion.service';

@ApiTags('TalentoHumano-Mensualizacion')
@Controller('talento-humano/mensualizacion')
export class MensualizacionController {
    constructor(private readonly service: MensualizacionService) { }

    @Get('getSolicitudesByEmpleado')
    @ApiOperation({ summary: 'Modalidad vigente (mensualizado/acumulado) por rubro para un empleado' })
    getSolicitudesByEmpleado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetSolicitudesByEmpleadoDto,
    ) {
        return this.service.getSolicitudesByEmpleado({ ...headersParams, ...dtoIn });
    }

    @Post('save')
    @ApiOperation({ summary: 'Definir la modalidad (mensualizado/acumulado) de un rubro para un empleado' })
    save(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveSolicitudMensualizacionDto,
    ) {
        return this.service.save({ ...headersParams, ...dtoIn });
    }
}
