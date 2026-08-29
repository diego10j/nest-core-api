import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetPuestosSalariosByEmpleadoDto, SavePuestoSalarioDto } from './dto/puestos-salarios.dto';
import { PuestosSalariosService } from './puestos-salarios.service';

@ApiTags('TalentoHumano-PuestosSalarios')
@Controller('talento-humano/puestos-salarios')
export class PuestosSalariosController {
    constructor(private readonly service: PuestosSalariosService) { }

    @Get('getPuestosSalariosByEmpleado')
    @ApiOperation({ summary: 'Historial de asignaciones de puesto/salario de un empleado' })
    getPuestosSalariosByEmpleado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetPuestosSalariosByEmpleadoDto,
    ) {
        return this.service.getPuestosSalariosByEmpleado({ ...headersParams, ...dtoIn });
    }

    @Post('save')
    @ApiOperation({ summary: 'Crear o actualizar una asignación de puesto/salario' })
    save(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SavePuestoSalarioDto,
    ) {
        return this.service.save({ ...headersParams, ...dtoIn });
    }
}
