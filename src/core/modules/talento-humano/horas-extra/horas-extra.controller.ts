import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AprobarCandidataDto, DetectarCandidatasDto, EliminarFeriadoDto, GenerarFeriadosDto, GetCandidatasDto, SaveFeriadoDto, RechazarCandidatasDto } from './dto/horas-extra.dto';
import { HorasExtraService } from './horas-extra.service';

@ApiTags('TalentoHumano-HorasExtra')
@Controller('talento-humano/horas-extra')
export class HorasExtraController {
    constructor(private readonly service: HorasExtraService) { }

    @Post('detectar')
    @ApiOperation({ summary: 'Detectar candidatas a hora extra desde asi_marcaciones en un rango de fechas' })
    detectar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: DetectarCandidatasDto,
    ) {
        return this.service.detectarCandidatas({ ...headersParams, ...dtoIn });
    }

    @Get('getCandidatas')
    @ApiOperation({ summary: 'Listar candidatas a hora extra (pendientes/aprobadas/rechazadas)' })
    getCandidatas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetCandidatasDto,
    ) {
        return this.service.getCandidatas({ ...headersParams, ...dtoIn });
    }

    @Post('aprobar')
    @ApiOperation({ summary: 'Aprobar una candidata a hora extra, clasificándola (suplementaria/extraordinaria) y justificándola' })
    aprobar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AprobarCandidataDto,
    ) {
        return this.service.aprobar({ ...headersParams, ...dtoIn });
    }

    @Post('rechazar')
    @ApiOperation({ summary: 'Rechazar una o varias candidatas a hora extra' })
    rechazar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RechazarCandidatasDto,
    ) {
        return this.service.rechazar({ ...headersParams, ...dtoIn });
    }

    @Get('getFeriados')
    @ApiOperation({ summary: 'Listar catálogo de feriados' })
    getFeriados() {
        return this.service.getFeriados();
    }

    @Post('saveFeriado')
    @ApiOperation({ summary: 'Registrar un feriado' })
    saveFeriado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveFeriadoDto,
    ) {
        return this.service.saveFeriado({ ...headersParams, ...dtoIn });
    }

    @Post('generarFeriadosAnio')
    @ApiOperation({ summary: 'Generar el calendario de feriados nacionales de un año (cálculo determinista, reemplaza los existentes de ese año)' })
    generarFeriadosAnio(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: GenerarFeriadosDto,
    ) {
        return this.service.generarFeriadosAnio({ ...headersParams, ...dtoIn });
    }

    @Post('eliminarFeriado')
    @ApiOperation({ summary: 'Eliminar un feriado' })
    eliminarFeriado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: EliminarFeriadoDto,
    ) {
        return this.service.eliminarFeriado({ ...headersParams, ...dtoIn });
    }
}
