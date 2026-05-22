import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetDepositosCajaPendientesDto } from './dto/get-depositos-caja-pendientes.dto';
import { ReporteCobrosDto } from './dto/reporte-cobros.dto';
import { ReportePagosDto } from './dto/reporte-pagos.dto';
import { ReportesTesoreriaService } from './reportes-tesoreria.service';

@ApiTags('Tesoreria - Reportes')
@Controller('tesoreria/reportes')
export class ReportesTesoreriaController {
    constructor(private readonly service: ReportesTesoreriaService) { }

    @Get('getReporteCobros')
    @ApiOperation({ summary: 'Reporte de cobros CxC en tesoreria para un mes/año' })
    getReporteCobros(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ReporteCobrosDto,
    ) {
        return this.service.getReporteCobros({ ...headersParams, ...dtoIn });
    }

    @Get('getReportePagos')
    @ApiOperation({ summary: 'Reporte de pagos CxP en tesoreria para un mes/año' })
    getReportePagos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ReportePagosDto,
    ) {
        return this.service.getReportePagos({ ...headersParams, ...dtoIn });
    }

    @Get('getDepositosCajaPendientes')
    @ApiOperation({ summary: 'Listar depositos pendientes de caja a banco' })
    getDepositosCajaPendientes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDepositosCajaPendientesDto,
    ) {
        return this.service.getDepositosCajaPendientes({ ...headersParams, ...dtoIn });
    }

    @Get('getReporteMovimientosCuenta')
    @ApiOperation({ summary: 'Reporte de movimientos de una cuenta en rango de fechas' })
    getReporteMovimientosCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: { ideTecba: number; fechaInicio: string; fechaFin: string },
    ) {
        return this.service.getReporteMovimientosCuenta({ ...headersParams, ...dtoIn });
    }
}
