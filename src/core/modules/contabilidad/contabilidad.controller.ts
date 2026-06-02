import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ContabilidadService } from './contabilidad.service';
import { EstadosFinancierosDto } from './dto/estados-financieros.dto';
import { LibroDiarioDto } from './dto/libro-diario.dto';
import { LibroMayorDto } from './dto/libro-mayor.dto';
import { PeriodoFechaDto, PeriodoIdDto } from './dto/periodo.dto';

@ApiTags('Contabilidad')
@Controller('contabilidad')
export class ContabilidadController {
    constructor(private readonly contabilidadService: ContabilidadService) { }

    @Get('getLibroDiario')
    @ApiOperation({ summary: 'Obtener libro diario contable por período' })
    getLibroDiario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LibroDiarioDto) {
        return this.contabilidadService.getLibroDiario({ ...headersParams, ...dtoIn });
    }

    @Get('getLibroMayor')
    @ApiOperation({ summary: 'Obtener libro mayor por cuenta y período' })
    getLibroMayor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LibroMayorDto) {
        return this.contabilidadService.getLibroMayor({ ...headersParams, ...dtoIn });
    }

    @Get('getBalanceGeneral')
    @ApiOperation({ summary: 'Obtener balance general por período contable' })
    getBalanceGeneral(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EstadosFinancierosDto) {
        return this.contabilidadService.getBalanceGeneral({ ...headersParams, ...dtoIn });
    }

    @Get('getEstadoResultados')
    @ApiOperation({ summary: 'Obtener estado de resultados (pérdidas y ganancias) por período' })
    getEstadoResultados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EstadosFinancierosDto) {
        return this.contabilidadService.getEstadoResultados({ ...headersParams, ...dtoIn });
    }

    @Get('getComboPeriodos')
    @ApiOperation({ summary: 'Obtener listado de períodos contables para selector' })
    getComboPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.contabilidadService.getComboPeriodos(headersParams);
    }

    @Get('getPeriodo')
    @ApiOperation({ summary: 'Obtener datos de un período contable por ID' })
    getPeriodo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoIdDto) {
        return this.contabilidadService.getPeriodo({ ...headersParams, ...dtoIn });
    }

    @Get('getPeriodoFecha')
    @ApiOperation({ summary: 'Obtener período contable que contiene una fecha dada' })
    getPeriodoFecha(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoFechaDto) {
        return this.contabilidadService.getPeriodoFecha({ ...headersParams, ...dtoIn });
    }

    @Get('getFlujosEfectivo')
    @ApiOperation({ summary: 'Obtener estado de flujo de efectivo por período (NIC 7 — Método Indirecto)' })
    getFlujosEfectivo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EstadosFinancierosDto) {
        return this.contabilidadService.getFlujosEfectivo({ ...headersParams, ...dtoIn });
    }
}

