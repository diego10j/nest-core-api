import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import {
    AnularPermisoDto,
    CrearPermisoDto,
    GetPermisosDto,
    AprobarPermisoDto,
    GetSaldoVacacionesDto,
    AprobarJustificacionDto,
    RegistrarMovimientoVacacionDto,
} from './dto/vacaciones-permisos.dto';
import { VacacionesPermisosService } from './vacaciones-permisos.service';

@ApiTags('TalentoHumano-VacacionesPermisos')
@Controller('talento-humano/vacaciones-permisos')
export class VacacionesPermisosController {
    constructor(private readonly service: VacacionesPermisosService) { }

    @Get('getSaldoVacaciones')
    @ApiOperation({ summary: 'Saldo de vacaciones disponible de un empleado' })
    getSaldoVacaciones(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetSaldoVacacionesDto,
    ) {
        return this.service.getSaldoVacaciones({ ...headersParams, ...dtoIn });
    }

    @Get('getMovimientos')
    @ApiOperation({ summary: 'Historial de movimientos de vacaciones de un empleado' })
    getMovimientos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetSaldoVacacionesDto,
    ) {
        return this.service.getMovimientos({ ...headersParams, ...dtoIn });
    }

    @Post('registrarMovimiento')
    @ApiOperation({ summary: 'Registrar un movimiento manual de vacaciones (ej. acumulación anual)' })
    registrarMovimiento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RegistrarMovimientoVacacionDto,
    ) {
        return this.service.registrarMovimiento({ ...headersParams, ...dtoIn });
    }

    @Get('getPermisos')
    @ApiOperation({ summary: 'Listar permisos (por horas / con cargo a vacaciones)' })
    getPermisos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetPermisosDto,
    ) {
        return this.service.getPermisos({ ...headersParams, ...dtoIn });
    }

    @Post('crearPermiso')
    @ApiOperation({ summary: 'Crear un permiso; si es con cargo a vacaciones descuenta el saldo automáticamente' })
    crearPermiso(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: CrearPermisoDto,
    ) {
        return this.service.crearPermiso({ ...headersParams, ...dtoIn });
    }

    @Post('anularPermiso')
    @ApiOperation({ summary: 'Anular un permiso y reversar el movimiento de vacaciones asociado' })
    anularPermiso(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularPermisoDto,
    ) {
        return this.service.anularPermiso({ ...headersParams, ...dtoIn });
    }

    @Post('aprobarPermiso')
    @ApiOperation({ summary: 'Aprueba un permiso/vacación pendiente (el coordinador recibió el documento firmado)' })
    aprobarPermiso(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AprobarPermisoDto,
    ) {
        return this.service.aprobarPermiso({ ...headersParams, ...dtoIn });
    }

    @Get('getJustificacionesPendientes')
    @ApiOperation({ summary: 'Justificaciones de marcación (tipo_aspvh=4) para revisión del coordinador' })
    getJustificacionesPendientes(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getJustificacionesPendientes(headersParams);
    }

    @Post('aprobarJustificacion')
    @ApiOperation({ summary: 'Aprueba una justificación de marcación: crea/completa la marca real en asi_marcaciones' })
    aprobarJustificacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AprobarJustificacionDto,
    ) {
        return this.service.aprobarJustificacion({ ...headersParams, ...dtoIn });
    }
}
