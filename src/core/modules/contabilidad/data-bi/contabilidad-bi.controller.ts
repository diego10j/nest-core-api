import { Controller, Get, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

import { ComparativoPeriodosDto, PeriodoAnioDto, TopCuentasBiDto } from './dto/contabilidad-bi.dto';
import { ContabilidadBiService } from './contabilidad-bi.service';

@Controller('contabilidad/data-bi')
export class ContabilidadBiController {
    constructor(private readonly service: ContabilidadBiService) { }

    // ─── KPIs ────────────────────────────────────────────────────────────────────

    @Get('getKpisPrincipales')
    // @Auth()
    getKpisPrincipales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getKpisPrincipales({ ...headersParams, ...dtoIn });
    }

    @Get('getRatiosFinancieros')
    // @Auth()
    getRatiosFinancieros(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getRatiosFinancieros({ ...headersParams, ...dtoIn });
    }

    // ─── Gráficos ────────────────────────────────────────────────────────────────

    @Get('getEvolucionMensualResultados')
    // @Auth()
    getEvolucionMensualResultados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoAnioDto) {
        return this.service.getEvolucionMensualResultados({ ...headersParams, ...dtoIn });
    }

    @Get('getComposicionBalance')
    // @Auth()
    getComposicionBalance(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getComposicionBalance({ ...headersParams, ...dtoIn });
    }

    @Get('getDistribucionGastos')
    // @Auth()
    getDistribucionGastos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasBiDto) {
        return this.service.getDistribucionGastos({ ...headersParams, ...dtoIn });
    }

    @Get('getMovimientosMensuales')
    // @Auth()
    getMovimientosMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoAnioDto) {
        return this.service.getMovimientosMensuales({ ...headersParams, ...dtoIn });
    }

    @Get('getTopCuentasMayorMovimiento')
    // @Auth()
    getTopCuentasMayorMovimiento(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasBiDto) {
        return this.service.getTopCuentasMayorMovimiento({ ...headersParams, ...dtoIn });
    }

    @Get('getComparativoPeriodos')
    // @Auth()
    getComparativoPeriodos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComparativoPeriodosDto) {
        return this.service.getComparativoPeriodos({ ...headersParams, ...dtoIn });
    }

    @Get('getTendenciaBalance')
    // @Auth()
    getTendenciaBalance(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoAnioDto) {
        return this.service.getTendenciaBalance({ ...headersParams, ...dtoIn });
    }

    @Get('getDistribucionIngresos')
    // @Auth()
    getDistribucionIngresos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasBiDto) {
        return this.service.getDistribucionIngresos({ ...headersParams, ...dtoIn });
    }

    @Get('getActividadPorDiaSemana')
    // @Auth()
    getActividadPorDiaSemana(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getActividadPorDiaSemana({ ...headersParams, ...dtoIn });
    }

    @Get('getResumenPorTipoComprobante')
    // @Auth()
    getResumenPorTipoComprobante(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getResumenPorTipoComprobante({ ...headersParams, ...dtoIn });
    }
}
