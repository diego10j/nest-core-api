import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
    @ApiOperation({ summary: 'Listar todos los planes de cuentas de la empresa' })
    getCabPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
        return this.service.getCabPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /** Retorna el plan de cuentas activo de la sucursal del usuario */
    @Get('getCabPlanCuentaActivo')
    @ApiOperation({ summary: 'Obtener el plan de cuentas activo de la sucursal del usuario' })
    getCabPlanCuentaActivo(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCabPlanCuentaActivo(headersParams);
    }

    /** Busca la cabecera de un plan por su PK */
    @Get('findCabById')
    @ApiOperation({ summary: 'Obtener cabecera de plan de cuentas por ID' })
    findCabById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
        return this.service.findCabById({ ...headersParams, ...dtoIn });
    }

    /** Crea o actualiza la cabecera de un plan de cuentas */
    @Post('saveCabPlanCuentas')
    @ApiOperation({ summary: 'Crear o actualizar cabecera de plan de cuentas' })
    saveCabPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCabPlanCuenDto) {
        return this.service.saveCabPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /** Elimina una o varias cabeceras de plan de cuentas */
    @Delete('deleteCabPlanCuentas')
    @ApiOperation({ summary: 'Eliminar una o varias cabeceras de plan de cuentas' })
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
    @ApiOperation({ summary: 'Listar cuentas del plan de cuentas activo con filtros y paginación' })
    getPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetPlanCuentaDto) {
        return this.service.getPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /**
     * Árbol jerárquico (CTE recursivo) del plan de cuentas activo.
     * Ideal para renderizar TreeView en el frontend.
     */
    @Get('getArbolPlanCuentas')
    @ApiOperation({ summary: 'Obtener árbol jerárquico del plan de cuentas activo (para TreeView)' })
    getArbolPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetPlanCuentaDto) {
        return this.service.getArbolPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /**
     * Solo cuentas de nivel HIJO del plan activo.
     * Se usan al asignar una cuenta en transacciones contables.
     */
    @Get('getCuentasHijas')
    @ApiOperation({ summary: 'Listar cuentas de nivel hijo del plan activo (para asignación en transacciones)' })
    getCuentasHijas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetPlanCuentaDto) {
        return this.service.getCuentasHijas({ ...headersParams, ...dtoIn });
    }

    /**
     * Cuentas filtradas por tipo (activos, pasivos, patrimonio, etc.).
     * Si no se envía ide_cntcu retorna todos los tipos.
     */
    @Get('getCuentasPorTipo')
    @ApiOperation({ summary: 'Listar cuentas filtradas por tipo (activos, pasivos, patrimonio, ingresos, gastos)' })
    getCuentasPorTipo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCuentasPorTipoDto) {
        return this.service.getCuentasPorTipo({ ...headersParams, ...dtoIn });
    }

    /** Búsqueda de cuentas por código o nombre (autocomplete) */
    @Get('searchCuentas')
    @ApiOperation({ summary: 'Buscar cuentas por código o nombre (autocomplete)' })
    searchCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
        return this.service.searchCuentas({ ...headersParams, ...dtoIn });
    }

    /** Búsqueda de cuentas contables del plan activo por código o nombre */
    @Get('searchCuentaContable')
    @ApiOperation({ summary: 'Buscar cuentas contables del plan activo por código o nombre (autocomplete)' })
    searchCuentaContable(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
        return this.service.searchCuentaContable({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────────
    // CATÁLOGOS
    // ─────────────────────────────────────────────────────────────────

    /** Niveles del plan de cuentas configurados para la empresa */
    @Get('getNivelesPlanCuentas')
    @ApiOperation({ summary: 'Obtener niveles del plan de cuentas configurados para la empresa' })
    getNivelesPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getNivelesPlanCuentas(headersParams);
    }

    /** Tipos de cuenta (Activo, Pasivo, Patrimonio, Ingresos, Gastos, etc.) */
    @Get('getTiposCuenta')
    @ApiOperation({ summary: 'Obtener tipos de cuenta (Activo, Pasivo, Patrimonio, Ingresos, Gastos)' })
    getTiposCuenta(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getTiposCuenta(headersParams);
    }

    /** Retorna el nivel máximo de cuentas en el plan activo */
    @Get('getUltimoNivelCuentas')
    @ApiOperation({ summary: 'Obtener el nivel máximo de cuentas en el plan activo' })
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
    @ApiOperation({ summary: 'Verificar si una cuenta es de nivel hijo (válida para asientos contables)' })
    isCuentaHija(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
        return this.service.isCuentaHija({ ...headersParams, ...dtoIn });
    }

    /** Busca una cuenta (detalle) por su PK */
    @Get('findDetById')
    @ApiOperation({ summary: 'Obtener cuenta contable (detalle) por ID' })
    findDetById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDto) {
        return this.service.findDetById({ ...headersParams, ...dtoIn });
    }

    /** Crea o actualiza una cuenta contable */
    @Post('saveDetPlanCuentas')
    @ApiOperation({ summary: 'Crear o actualizar una cuenta contable' })
    saveDetPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetPlanCuenDto) {
        return this.service.saveDetPlanCuentas({ ...headersParams, ...dtoIn });
    }

    /** Elimina una o varias cuentas contables */
    @Delete('deleteDetPlanCuentas')
    @ApiOperation({ summary: 'Eliminar una o varias cuentas contables' })
    deleteDetPlanCuentas(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteDetPlanCuentas({ ...headersParams, ...dtoIn });
    }
}
