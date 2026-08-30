import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetEmpleadoByIdDto, GetEmpleadosDto, SaveEmpleadoDto, VincularUsuarioDto } from './dto/empleados.dto';
import { EmpleadosService } from './empleados.service';

@ApiTags('TalentoHumano-Empleados')
@Controller('talento-humano/empleados')
export class EmpleadosController {
    constructor(private readonly service: EmpleadosService) { }

    @Get('getEmpleados')
    @ApiOperation({ summary: 'Listar empleados de la empresa' })
    getEmpleados(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetEmpleadosDto,
    ) {
        return this.service.getEmpleados({ ...headersParams, ...dtoIn });
    }

    @Get('getEmpleadoById')
    @ApiOperation({ summary: 'Obtener la ficha completa de un empleado por ID' })
    getEmpleadoById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetEmpleadoByIdDto,
    ) {
        return this.service.getEmpleadoById({ ...headersParams, ...dtoIn });
    }

    @Get('getMiEmpleado')
    @ApiOperation({ summary: 'Resuelve el empleado vinculado al usuario logueado, para las páginas de autoservicio' })
    getMiEmpleado(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getMiEmpleado(headersParams);
    }

    @Get('getCatalogos')
    @ApiOperation({ summary: 'Catálogos base (género, tipo documento, estado civil, tipo sangre, nacionalidad, cargo) para el formulario de ficha' })
    getCatalogos(
        @AppHeaders() headersParams: HeaderParamsDto,
    ) {
        return this.service.getCatalogos(headersParams);
    }

    @Post('save')
    @ApiOperation({ summary: 'Crear o actualizar un empleado (gen_persona + gth_empleado)' })
    save(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveEmpleadoDto,
    ) {
        return this.service.save({ ...headersParams, ...dtoIn });
    }

    @Post('vincularUsuario')
    @ApiOperation({ summary: 'Vincula (o desvincula) un empleado a su usuario de acceso al sistema, para habilitar el autoservicio' })
    vincularUsuario(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: VincularUsuarioDto,
    ) {
        return this.service.vincularUsuario({ ...headersParams, ...dtoIn });
    }
}
