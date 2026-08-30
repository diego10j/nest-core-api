import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import {
    AnularRolDto,
    AprobarRolDto,
    CerrarRolDto,
    GenerarLiquidacionDecimoDto,
    GenerarRolDto,
    GetRolByIdDto,
    GetRolesDto,
    RecalcularRolDto,
} from './dto/rol-pagos.dto';
import { RolPagosService } from './rol-pagos.service';

@ApiTags('TalentoHumano-RolPagos')
@Controller('talento-humano/rol-pagos')
export class RolPagosController {
    constructor(private readonly service: RolPagosService) { }

    @Get('getRoles')
    @ApiOperation({ summary: 'Listar roles de pago generados' })
    getRoles(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetRolesDto,
    ) {
        return this.service.getRoles({ ...headersParams, ...dtoIn });
    }

    @Get('getRolById')
    @ApiOperation({ summary: 'Obtener un rol de pago (cabecera + detalle por empleado y rubro)' })
    getRolById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetRolByIdDto,
    ) {
        return this.service.getRolById({ ...headersParams, ...dtoIn });
    }

    @Post('generar')
    @ApiOperation({ summary: 'Generar (calcular) un rol de pagos para todos los empleados vigentes del tipo de nómina indicado' })
    generar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: GenerarRolDto,
    ) {
        return this.service.generarRol({ ...headersParams, ...dtoIn });
    }

    @Post('recalcular')
    @ApiOperation({
        summary:
            'Recalcula un rol aún no cerrado ni anulado (borra su detalle previo, libera las horas ' +
            'extra que había consumido y vuelve a correr el cálculo completo en el mismo ide_nrrol)',
    })
    recalcular(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RecalcularRolDto,
    ) {
        return this.service.recalcularRol({ ...headersParams, ...dtoIn });
    }

    @Put('aprobar')
    @ApiOperation({ summary: 'Aprobar (bloquear) un rol de pagos ya generado' })
    aprobar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AprobarRolDto,
    ) {
        return this.service.aprobar({ ...headersParams, ...dtoIn });
    }

    @Put('anular')
    @ApiOperation({ summary: 'Anular un rol de pagos' })
    anular(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularRolDto,
    ) {
        return this.service.anular({ ...headersParams, ...dtoIn });
    }

    @Post('cerrar')
    @ApiOperation({ summary: 'Cerrar un rol: genera el asiento contable consolidado y una CxP por empleado' })
    cerrar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: CerrarRolDto,
    ) {
        return this.service.cerrarRol({ ...headersParams, ...dtoIn });
    }

    @Post('generarLiquidacionDecimo')
    @ApiOperation({
        summary:
            'Liquidación anual de décimo tercero o décimo cuarto: suma las provisiones mensuales del ' +
            'período legal (excluyendo empleados mensualizados) y genera un rol independiente con su ' +
            'asiento contable y CxP por empleado',
    })
    generarLiquidacionDecimo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: GenerarLiquidacionDecimoDto,
    ) {
        return this.service.generarLiquidacionDecimo({ ...headersParams, ...dtoIn });
    }
}
