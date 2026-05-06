import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

import { ComparativoPeriodosDto, PeriodoAnioDto, TopCuentasBiDto } from './dto/contabilidad-bi.dto';
import { ContabilidadBiService } from './contabilidad-bi.service';

@ApiTags('Contabilidad-DataBI')
@Controller('contabilidad/data-bi')
export class ContabilidadBiController {
    constructor(private readonly service: ContabilidadBiService) { }

    // ─── KPIs ────────────────────────────────────────────────────────────────────

    @Get('getKpisPrincipales')
    @ApiOperation({ summary: 'Obtener KPIs financieros principales (liquidez, rentabilidad, endeudamiento)' })
    // @Auth()
    getKpisPrincipales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getKpisPrincipales({ ...headersParams, ...dtoIn });
    }

    @Get('getRatiosFinancieros')
    @ApiOperation({ summary: 'Obtener ratios financieros (corriente, endeudamiento, ROE, ROA)' })
    // @Auth()
    getRatiosFinancieros(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getRatiosFinancieros({ ...headersParams, ...dtoIn });
    }

    // ─── Gráficos ────────────────────────────────────────────────────────────────

    @Get('getEvolucionMensualResultados')
    @ApiOperation({ summary: 'Obtener evolución mensual de ingresos, gastos y utilidad' })
    // @Auth()
    getEvolucionMensualResultados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoAnioDto) {
        return this.service.getEvolucionMensualResultados({ ...headersParams, ...dtoIn });
    }

    @Get('getComposicionBalance')
    @ApiOperation({ summary: 'Obtener composición del balance general (activos, pasivos, patrimonio)' })
    // @Auth()
    getComposicionBalance(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getComposicionBalance({ ...headersParams, ...dtoIn });
    }

    @Get('getDistribucionGastos')
    @ApiOperation({ summary: 'Obtener distribución de gastos por cuenta contable en un período' })
    // @Auth()
    getDistribucionGastos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasBiDto) {
        return this.service.getDistribucionGastos({ ...headersParams, ...dtoIn });
    }

    @Get('getVolumenMensualMovimientos')
    @ApiOperation({ summary: 'Obtener volumen mensual de movimientos contables por año' })
    // @Auth()
    getVolumenMensualMovimientos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoAnioDto) {
        return this.service.getVolumenMensualMovimientos({ ...headersParams, ...dtoIn });
    }

    @Get('getTopCuentasMayorMovimiento')
    @ApiOperation({ summary: 'Obtener top de cuentas contables con mayor movimiento en un período' })
    // @Auth()
    getTopCuentasMayorMovimiento(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasBiDto) {
        return this.service.getTopCuentasMayorMovimiento({ ...headersParams, ...dtoIn });
    }

    @Get('getComparativoPeriodos')
    @ApiOperation({ summary: 'Obtener comparativo de estados financieros entre dos períodos' })
    // @Auth()
    getComparativoPeriodos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ComparativoPeriodosDto) {
        return this.service.getComparativoPeriodos({ ...headersParams, ...dtoIn });
    }

    @Get('getTendenciaBalance')
    @ApiOperation({ summary: 'Obtener tendencia mensual del balance general por año' })
    // @Auth()
    getTendenciaBalance(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PeriodoAnioDto) {
        return this.service.getTendenciaBalance({ ...headersParams, ...dtoIn });
    }

    @Get('getDistribucionIngresos')
    @ApiOperation({ summary: 'Obtener distribución de ingresos por cuenta contable en un período' })
    // @Auth()
    getDistribucionIngresos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopCuentasBiDto) {
        return this.service.getDistribucionIngresos({ ...headersParams, ...dtoIn });
    }

    @Get('getActividadPorDiaSemana')
    @ApiOperation({ summary: 'Obtener actividad contable agrupada por día de la semana' })
    // @Auth()
    getActividadPorDiaSemana(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getActividadPorDiaSemana({ ...headersParams, ...dtoIn });
    }

    @Get('getResumenPorTipoComprobante')
    @ApiOperation({ summary: 'Obtener resumen de asientos contables agrupados por tipo de comprobante' })
    // @Auth()
    getResumenPorTipoComprobante(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getResumenPorTipoComprobante({ ...headersParams, ...dtoIn });
    }
}
