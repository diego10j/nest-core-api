import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import {
    EliminarCuentaBancariaDto,
    EliminarEducacionDto,
    EliminarExperienciaLaboralDto,
    GetByEmpleadoDto,
    SaveCuentaBancariaDto,
    SaveEducacionDto,
    SaveExperienciaLaboralDto,
} from './dto/ficha-empleado.dto';
import { FichaEmpleadoService } from './ficha-empleado.service';

@ApiTags('TalentoHumano-FichaEmpleado')
@Controller('talento-humano/ficha-empleado')
export class FichaEmpleadoController {
    constructor(private readonly service: FichaEmpleadoService) { }

    @Get('getCatalogos')
    @ApiOperation({ summary: 'Catálogos para Educación/Título y Experiencia Laboral' })
    getCatalogos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCatalogos(headersParams);
    }

    @Get('getEducacion')
    @ApiOperation({ summary: 'Educación/títulos registrados de un empleado' })
    getEducacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetByEmpleadoDto) {
        return this.service.getEducacion({ ...headersParams, ...dtoIn });
    }

    @Post('saveEducacion')
    @ApiOperation({ summary: 'Crear o actualizar un registro de educación/título' })
    saveEducacion(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveEducacionDto) {
        return this.service.saveEducacion({ ...headersParams, ...dtoIn });
    }

    @Post('eliminarEducacion')
    @ApiOperation({ summary: 'Eliminar (desactivar) un registro de educación/título' })
    eliminarEducacion(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: EliminarEducacionDto) {
        return this.service.eliminarEducacion({ ...headersParams, ...dtoIn });
    }

    @Get('getExperienciaLaboral')
    @ApiOperation({ summary: 'Experiencia laboral registrada de un empleado' })
    getExperienciaLaboral(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetByEmpleadoDto) {
        return this.service.getExperienciaLaboral({ ...headersParams, ...dtoIn });
    }

    @Post('saveExperienciaLaboral')
    @ApiOperation({ summary: 'Crear o actualizar un registro de experiencia laboral' })
    saveExperienciaLaboral(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveExperienciaLaboralDto) {
        return this.service.saveExperienciaLaboral({ ...headersParams, ...dtoIn });
    }

    @Post('eliminarExperienciaLaboral')
    @ApiOperation({ summary: 'Eliminar (desactivar) un registro de experiencia laboral' })
    eliminarExperienciaLaboral(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: EliminarExperienciaLaboralDto) {
        return this.service.eliminarExperienciaLaboral({ ...headersParams, ...dtoIn });
    }

    @Get('getCuentaBancaria')
    @ApiOperation({ summary: 'Cuentas bancarias registradas de un empleado' })
    getCuentaBancaria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetByEmpleadoDto) {
        return this.service.getCuentaBancaria({ ...headersParams, ...dtoIn });
    }

    @Post('saveCuentaBancaria')
    @ApiOperation({ summary: 'Crear o actualizar una cuenta bancaria del empleado' })
    saveCuentaBancaria(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCuentaBancariaDto) {
        return this.service.saveCuentaBancaria({ ...headersParams, ...dtoIn });
    }

    @Post('eliminarCuentaBancaria')
    @ApiOperation({ summary: 'Eliminar (desactivar) una cuenta bancaria del empleado' })
    eliminarCuentaBancaria(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: EliminarCuentaBancariaDto) {
        return this.service.eliminarCuentaBancaria({ ...headersParams, ...dtoIn });
    }
}
