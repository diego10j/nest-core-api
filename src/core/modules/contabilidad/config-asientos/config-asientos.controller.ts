import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { Auth } from 'src/core/auth';

import { ConfigAsientosService, GetDetConfAsieDto, GetVigConfAsieDto } from './config-asientos.service';
import { DeleteCabConfAsieDto, SaveCabConfAsieDto } from './dto/config-asientos.dto';

@ApiTags('Contabilidad-ConfigAsientos')
@Controller('contabilidad/config-asientos')
export class ConfigAsientosController {
    constructor(private readonly service: ConfigAsientosService) { }

    @Get('getCabConfAsie')
    @ApiOperation({ summary: 'Listar cabeceras de configuración de asientos automáticos (con_cab_conf_asie)' })
    @Auth()
    getCabConfAsie(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getCabConfAsie({ ...headersParams, ...dtoIn });
    }

    @Get('getVigConfAsie')
    @ApiOperation({ summary: 'Listar vigencias de una cabecera de configuración de asiento (con_vig_conf_asie)' })
    @Auth()
    getVigConfAsie(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetVigConfAsieDto) {
        return this.service.getVigConfAsie({ ...headersParams, ...dtoIn });
    }

    @Get('getDetConfAsie')
    @ApiOperation({ summary: 'Listar el detalle de cuentas de una vigencia (con_det_conf_asie)' })
    @Auth()
    getDetConfAsie(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetConfAsieDto) {
        return this.service.getDetConfAsie({ ...headersParams, ...dtoIn });
    }

    @Get('getPorcenImpues')
    @ApiOperation({ summary: 'Listar porcentajes reutilizables (con_porcen_impues)' })
    @Auth()
    getPorcenImpues(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getPorcenImpues({ ...headersParams, ...dtoIn });
    }

    @Post('saveCabConfAsie')
    @ApiOperation({ summary: 'Crear o actualizar una cabecera de configuración de asiento (protege identificadores usados por el motor de asientos)' })
    @Auth()
    saveCabConfAsie(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCabConfAsieDto) {
        return this.service.saveCabConfAsie({ ...headersParams, ...dtoIn });
    }

    @Post('deleteCabConfAsie')
    @ApiOperation({ summary: 'Eliminar una o varias cabeceras de configuración de asiento (protege identificadores usados por el motor de asientos)' })
    @Auth()
    deleteCabConfAsie(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: DeleteCabConfAsieDto) {
        return this.service.deleteCabConfAsie({ ...headersParams, ...dtoIn });
    }
}
