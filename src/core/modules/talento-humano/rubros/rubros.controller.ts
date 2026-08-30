import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import {
    GetDetalleRubrosByTipoNominaDto,
    SaveCargoDto,
    SaveDepartamentoTipoGastoDto,
    SaveDetalleRubroDto,
    SaveRubroCuentaDto,
    SaveRubroDto,
} from './dto/rubros.dto';
import { RubrosService } from './rubros.service';

@ApiTags('TalentoHumano-Rubros')
@Controller('talento-humano/rubros')
export class RubrosController {
    constructor(private readonly service: RubrosService) { }

    @Get('getListDataTipoRubro')
    @ApiOperation({ summary: 'Catálogo tipo de rubro (ingreso/descuento) para Select' })
    getListDataTipoRubro(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataTipoRubro(headersParams);
    }

    @Get('getListDataFormaCalculo')
    @ApiOperation({ summary: 'Catálogo forma de cálculo para Select' })
    getListDataFormaCalculo(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataFormaCalculo(headersParams);
    }

    @Get('getListDataTipoNomina')
    @ApiOperation({ summary: 'Catálogo tipo de nómina para Select' })
    getListDataTipoNomina(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataTipoNomina(headersParams);
    }

    @Get('getListDataEstadoRol')
    @ApiOperation({ summary: 'Catálogo estado de rol para Select' })
    getListDataEstadoRol(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataEstadoRol(headersParams);
    }

    @Get('getListDataPeriodos')
    @ApiOperation({ summary: 'Catálogo de períodos de rol para Select' })
    getListDataPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataPeriodos(headersParams);
    }

    @Get('getDetalleTipoNomina')
    @ApiOperation({ summary: 'Combinaciones de tipo de nómina disponibles para generar un rol' })
    getDetalleTipoNomina(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getDetalleTipoNomina(headersParams);
    }

    @Get('getRubros')
    @ApiOperation({ summary: 'Listar catálogo de rubros de rol de pagos' })
    getRubros(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getRubros(headersParams);
    }

    @Post('saveRubro')
    @ApiOperation({ summary: 'Crear o actualizar un rubro' })
    saveRubro(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveRubroDto,
    ) {
        return this.service.saveRubro({ ...headersParams, ...dtoIn });
    }

    @Get('getDetalleRubrosByTipoNomina')
    @ApiOperation({ summary: 'Parametría (fórmulas) de rubros para un tipo de nómina específico' })
    getDetalleRubrosByTipoNomina(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDetalleRubrosByTipoNominaDto,
    ) {
        return this.service.getDetalleRubrosByTipoNomina({ ...headersParams, ...dtoIn });
    }

    @Post('saveDetalleRubro')
    @ApiOperation({ summary: 'Crear o actualizar la fórmula/parametría de un rubro para un tipo de nómina' })
    saveDetalleRubro(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveDetalleRubroDto,
    ) {
        return this.service.saveDetalleRubro({ ...headersParams, ...dtoIn });
    }

    @Get('getCargos')
    @ApiOperation({ summary: 'Listar catálogo de cargos' })
    getCargos() {
        return this.service.getCargos();
    }

    @Post('saveCargo')
    @ApiOperation({ summary: 'Crear o actualizar un cargo' })
    saveCargo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveCargoDto,
    ) {
        return this.service.saveCargo({ ...headersParams, ...dtoIn });
    }

    @Get('getRubrosCuenta')
    @ApiOperation({ summary: 'Listar el mapeo rubro -> cuenta contable (con_det_plan_cuen)' })
    getRubrosCuenta() {
        return this.service.getRubrosCuenta();
    }

    @Post('saveRubroCuenta')
    @ApiOperation({ summary: 'Definir la cuenta contable de un rubro' })
    saveRubroCuenta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveRubroCuentaDto,
    ) {
        return this.service.saveRubroCuenta({ ...headersParams, ...dtoIn });
    }

    @Get('getDepartamentos')
    @ApiOperation({ summary: 'Listar departamentos con su centro de costo (Ventas/Administrativo)' })
    getDepartamentos() {
        return this.service.getDepartamentos();
    }

    @Post('saveDepartamentoTipoGasto')
    @ApiOperation({ summary: 'Clasificar un departamento como centro de costo Ventas o Administrativo' })
    saveDepartamentoTipoGasto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveDepartamentoTipoGastoDto,
    ) {
        return this.service.saveDepartamentoTipoGasto({ ...headersParams, ...dtoIn });
    }
}
