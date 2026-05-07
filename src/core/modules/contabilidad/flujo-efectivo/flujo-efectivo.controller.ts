import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { DeleteFlujoClasifDto, SaveFlujoClasifDto } from './dto/flujo-efectivo.dto';
import { FlujoEfectivoService } from './flujo-efectivo.service';

@ApiTags('Contabilidad-FlujoEfectivo')
@Controller('contabilidad/flujo-efectivo')
export class FlujoEfectivoController {
    constructor(private readonly service: FlujoEfectivoService) { }

    @Get('getClasificaciones')
    @ApiOperation({ summary: 'Listar clasificaciones de cuentas para el Flujo de Efectivo' })
    getClasificaciones(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getClasificaciones(headersParams);
    }

    @Get('getCuentasParaClasificar')
    @ApiOperation({ summary: 'Cuentas del plan aún sin clasificación de flujo (excluye cuentas de efectivo de tesorería)' })
    getCuentasParaClasificar(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasParaClasificar(headersParams);
    }

    @Get('getCuentasEfectivo')
    @ApiOperation({ summary: 'Cuentas de Efectivo y Equivalentes identificadas automáticamente desde Tesorería' })
    getCuentasEfectivo(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasEfectivo(headersParams);
    }

    @Post('saveClasificacion')
    @ApiOperation({ summary: 'Crear o actualizar clasificación de flujo de una cuenta' })
    saveClasificacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveFlujoClasifDto,
    ) {
        return this.service.saveClasificacion({ ...headersParams, data: dtoIn });
    }

    @Delete('deleteClasificacion')
    @ApiOperation({ summary: 'Eliminar una o varias clasificaciones de flujo' })
    deleteClasificacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: DeleteFlujoClasifDto,
    ) {
        return this.service.deleteClasificacion({ ...headersParams, ...dtoIn });
    }
}
