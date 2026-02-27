import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SearchDto } from 'src/common/dto/search.dto';

import { GetCuentasPorTipoDto, GetDetPlanCuentaDto } from './dto/get-plan-cuentas.dto';
import { SaveCabPlanCuenDto } from './dto/save-cab-plan-cuen.dto';
import { SaveDetPlanCuenDto } from './dto/save-det-plan-cuen.dto';
import { PlanCuentasService } from './plan-cuentas.service';

@ApiTags('Contabilidad-PlanCuentas')
@Controller('contabilidad/plan-cuentas')
export class PlanCuentasController {
    constructor(private readonly service: PlanCuentasService) { }

    // ─────────────────────────────────────────────────────────────────
    // CABECERA
    // ─────────────────────────────────────────────────────────────────

    /** Lista todos los planes de cuentas de la empresa */
    @Get('getCabPlanCuentas')
    getCabPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getCabPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /** Retorna el plan de cuentas activo de la sucursal del usuario */
    @Get('getCabPlanCuentaActivo')
    getCabPlanCuentaActivo(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCabPlanCuentaActivo(headersParams);
    }

    /** Busca la cabecera de un plan por su PK */
    @Get('findCabById')
    findCabById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
        return this.service.findCabById({ ...headersParams, ...dtoIn });
    }

    /** Crea o actualiza la cabecera de un plan de cuentas */
    @Post('saveCabPlanCuentas')
    saveCabPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCabPlanCuenDto) {
        return this.service.saveCabPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /** Elimina una o varias cabeceras de plan de cuentas */
    @Delete('deleteCabPlanCuentas')
    deleteCabPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteCabPlanCuentas({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────────
    // CUENTAS (DETALLE) – Consultas
    // ─────────────────────────────────────────────────────────────────

    /**
     * Listado plano del plan de cuentas activo (con paginación/filtro).
     * Si se provee ide_cncpc usa ese plan; de lo contrario usa el activo.
     */
    @Get('getPlanCuentas')
    getPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetPlanCuentaDto) {
        return this.service.getPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /**
     * Árbol jerárquico (CTE recursivo) del plan de cuentas activo.
     * Ideal para renderizar TreeView en el frontend.
     */
    @Get('getArbolPlanCuentas')
    getArbolPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetPlanCuentaDto) {
        return this.service.getArbolPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /**
     * Solo cuentas de nivel HIJO del plan activo.
     * Se usan al asignar una cuenta en transacciones contables.
     */
    @Get('getCuentasHijas')
    getCuentasHijas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetPlanCuentaDto) {
        return this.service.getCuentasHijas({ ...headersParams, ...dtoIn });
    }

    /**
     * Cuentas filtradas por tipo (activos, pasivos, patrimonio, etc.).
     * Si no se envía ide_cntcu retorna todos los tipos.
     */
    @Get('getCuentasPorTipo')
    getCuentasPorTipo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCuentasPorTipoDto) {
        return this.service.getCuentasPorTipo({ ...headersParams, ...dtoIn });
    }

    /** Búsqueda de cuentas por código o nombre (autocomplete) */
    @Get('searchCuentas')
    searchCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
        return this.service.searchCuentas({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────────
    // CATÁLOGOS
    // ─────────────────────────────────────────────────────────────────

    /** Niveles del plan de cuentas configurados para la empresa */
    @Get('getNivelesPlanCuentas')
    getNivelesPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getNivelesPlanCuentas(headersParams);
    }

    /** Tipos de cuenta (Activo, Pasivo, Patrimonio, Ingresos, Gastos, etc.) */
    @Get('getTiposCuenta')
    getTiposCuenta(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getTiposCuenta(headersParams);
    }

    /** Retorna el nivel máximo de cuentas en el plan activo */
    @Get('getUltimoNivelCuentas')
    getUltimoNivelCuentas(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getUltimoNivelCuentas(headersParams);
    }

    // ─────────────────────────────────────────────────────────────────
    // CUENTAS (DETALLE) – CRUD
    // ─────────────────────────────────────────────────────────────────

    /**
     * Verifica si la cuenta indicada es de nivel HIJO.
     * Útil para validar antes de asignarla en un asiento.
     */
    @Get('isCuentaHija')
    isCuentaHija(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
        return this.service.isCuentaHija({ ...headersParams, ...dtoIn });
    }

    /** Busca una cuenta (detalle) por su PK */
    @Get('findDetById')
    findDetById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
        return this.service.findDetById({ ...headersParams, ...dtoIn });
    }

    /** Crea o actualiza una cuenta contable */
    @Post('saveDetPlanCuentas')
    saveDetPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetPlanCuenDto) {
        return this.service.saveDetPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /** Elimina una o varias cuentas contables */
    @Delete('deleteDetPlanCuentas')
    deleteDetPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteDetPlanCuentas({ ...headersParams, ...dtoIn });
    }
}
