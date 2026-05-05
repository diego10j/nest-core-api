import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
    getLibroDiario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LibroDiarioDto) {
        return this.contabilidadService.getLibroDiario({ ...headersParams, ...dtoIn });
    }

    @Get('getLibroMayor')
    getLibroMayor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: LibroMayorDto) {
        return this.contabilidadService.getLibroMayor({ ...headersParams, ...dtoIn });
    }

    @Get('getBalanceGeneral')
    getBalanceGeneral(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EstadosFinancierosDto) {
        return this.contabilidadService.getBalanceGeneral({ ...headersParams, ...dtoIn });
    }

    @Get('getEstadoResultados')
    getEstadoResultados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EstadosFinancierosDto) {
        return this.contabilidadService.getEstadoResultados({ ...headersParams, ...dtoIn });
    }

    @Get('getComboPeriodos')
    getComboPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.contabilidadService.getComboPeriodos(headersParams);
    }

    @Get('getPeriodo')
    getPeriodo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoIdDto) {
        return this.contabilidadService.getPeriodo({ ...headersParams, ...dtoIn });
    }

    @Get('getPeriodoFecha')
    getPeriodoFecha(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoFechaDto) {
        return this.contabilidadService.getPeriodoFecha({ ...headersParams, ...dtoIn });
    }
}

