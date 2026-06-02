import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { CopiarPresentacionDto } from './dto/copiar-presentacion.dto';
import { CrearMenudeoDto } from './dto/crear-menudeo.dto';
import { IdFormaDto } from './dto/id-forma.dto';
import { IdMenudeoDto } from './dto/id-menudeo.dto';
import { IdPresentacionDto } from './dto/id-presentacion.dto';
import { IdProductoMenudeoDto } from './dto/id-producto-menudeo.dto';
import { IdTipoCompDto } from './dto/id-tipo-comp.dto';
import { IdTipoTranDto } from './dto/id-tipo-tran.dto';
import { SaveAjusteMenudeoDto } from './dto/save-ajuste-menudeo.dto';
import { SaveFormaDto } from './dto/save-forma.dto';
import { SaveMenudeoDto } from './dto/save-menudeo.dto';
import { SavePresentacionDto } from './dto/save-presentacion.dto';
import { SaveSaldoInicialMenudeoDto } from './dto/save-saldo-inicial-menudeo.dto';
import { SaveTipoCompDto, SaveTipoTranDto } from './dto/save-tipo.dto';
import { StockMenudeoDto } from './dto/stock-menudeo.dto';
import { TrnMenudeoDto } from './dto/trn-menudeo.dto';
import { MenudeoSaveService } from './menudeo-save.service';
import { MenudeoService } from './menudeo.service';

@ApiTags('Inventario-Menudeo')
@Controller('inventario/menudeo')
export class MenudeoController {
    constructor(
        private readonly service: MenudeoService,
        private readonly saveService: MenudeoSaveService,
    ) { }

    // ─────────────────────────────────────────────────────────────
    // TIPOS DE COMPROBANTE / TRANSACCIÓN – CONSULTAS
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna los tipos de comprobante de menudeo (Ingreso/Egreso con signo).
     */
    @Get('getTipoCompMenudeo')
    @ApiOperation({ summary: 'Listar tipos de comprobante de menudeo (Ingreso/Egreso)' })
    getTipoCompMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTipoCompMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna todos los tipos de transacción de menudeo.
     */
    @Get('getTipoTranMenudeo')
    @ApiOperation({ summary: 'Listar todos los tipos de transacción de menudeo' })
    getTipoTranMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTipoTranMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna los tipos de transacción de un tipo de comprobante específico.
     * Query param: ide_inmtc
     */
    @Get('getTipoTranByTipoComp')
    @ApiOperation({ summary: 'Listar tipos de transacción de un tipo de comprobante de menudeo' })
    getTipoTranByTipoComp(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdTipoCompDto,
    ) {
        return this.service.getTipoTranByTipoComp({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // FORMAS DE MENUDEO (CATÁLOGO MAESTRO) – CONSULTAS
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna todas las formas de menudeo del catálogo maestro.
     */
    @Get('getFormas')
    @ApiOperation({ summary: 'Listar todas las formas de menudeo del catálogo maestro' })
    getFormas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getFormas({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna los insumos/envases configurados para una forma de menudeo.
     * Query param: ide_inmfor
     */
    @Get('getInsumosForma')
    @ApiOperation({ summary: 'Obtener insumos/envases configurados para una forma de menudeo' })
    getInsumosForma(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdFormaDto,
    ) {
        return this.service.getInsumosForma({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // PRESENTACIONES (VÍNCULO PRODUCTO ↔ FORMA) – CONSULTAS
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna las formas asignadas (presentaciones) a un producto base.
     * Query param: ide_inarti
     */
    @Get('getPresentacionesProducto')
    @ApiOperation({ summary: 'Obtener formas de menudeo (presentaciones) asignadas a un producto' })
    getPresentacionesProducto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoMenudeoDto,
    ) {
        return this.service.getPresentacionesProducto({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna las formas de menudeo que aún NO están asignadas a un producto.
     * Query param: ide_inarti
     */
    @Get('getFormasDisponiblesProducto')
    @ApiOperation({ summary: 'Obtener formas de menudeo disponibles (no asignadas) a un producto' })
    getFormasDisponiblesProducto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoMenudeoDto,
    ) {
        return this.service.getFormasDisponiblesProducto({ ...headersParams, ...dtoIn });
    }

    /**
     * Lista todos los productos que tienen formas de menudeo asignadas.
     */
    @Get('getProductosConMenudeo')
    @ApiOperation({ summary: 'Listar productos que tienen formas de menudeo asignadas' })
    getProductosConMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getProductosConMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Lista todos los productos y marca con una bandera si tienen
     * presentaciones de menudeo configuradas.
     */
    @Get('getProductosEstadoMenudeo')
    @ApiOperation({ summary: 'Listar productos con indicador de si tienen presentaciones de menudeo configuradas' })
    getProductosEstadoMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getProductosEstadoMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna productos que tienen presentaciones configuradas pero ningún comprobante
     * de menudeo registrado.
     * Son los únicos elegibles para crear un Saldo Inicial de menudeo.
     */
    @Get('getProductosSinComprobantesMenudeo')
    @ApiOperation({ summary: 'Listar productos con presentaciones configuradas pero sin comprobantes de menudeo (elegibles para saldo inicial)' })
    getProductosSinComprobantesMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getProductosSinComprobantesMenudeo({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // STOCK DE MENUDEO
    // ─────────────────────────────────────────────────────────────

    /**
     * Alertas de stock de menudeo de la empresa.
     * Retorna presentaciones cuyo saldo está por debajo del stock_minimo_inmpre.
     * Nivel de alerta: CRITICO (saldo=0), BAJO (< mínimo), IDEAL (< ideal).
     */
    @Get('getAlertasStockMenudeo')
    @ApiOperation({ summary: 'Obtener alertas de stock de menudeo (crítico, bajo, ideal) por presentación' })
    getAlertasStockMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getAlertasStockMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Stock de menudeo a una fecha de corte para todas las presentaciones activas.
     * Incluye saldo, estado de stock y alertas por presentación.
     * Query params: [fechaCorte] (por defecto hoy), [ide_inbod] (bodega, opcional)
     */
    @Get('getStockMenudeo')
    @ApiOperation({ summary: 'Obtener stock de menudeo a una fecha de corte para todas las presentaciones activas' })
    getStockMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: StockMenudeoDto,
    ) {
        return this.service.getStockMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna el saldo actual de menudeo por presentación de un producto.
     * Query param: ide_inarti
     */
    @Get('getSaldosMenudeoProducto')
    @ApiOperation({ summary: 'Obtener saldo actual de menudeo por presentación de un producto' })
    getSaldosMenudeoProducto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoMenudeoDto,
    ) {
        return this.service.getSaldosMenudeoProducto({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna el saldo de menudeo de una presentación específica.
     * Query param: ide_inmpre
     */
    @Get('getSaldoMenudeo')
    @ApiOperation({ summary: 'Obtener saldo de menudeo de una presentación específica' })
    getSaldoMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdPresentacionDto,
    ) {
        return this.service.getSaldoMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Resumen ejecutivo: stock inventario vs base consumida en menudeo + detalle por presentación.
     * Query param: ide_inarti
     */
    @Get('getResumenMenudeoProducto')
    @ApiOperation({ summary: 'Obtener resumen ejecutivo de stock inventario vs base consumida en menudeo por producto' })
    getResumenMenudeoProducto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoMenudeoDto,
    ) {
        return this.service.getResumenMenudeoProducto({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // COMPROBANTES – CONSULTAS
    // ─────────────────────────────────────────────────────────────

    /**
     * Lista de comprobantes de menudeo de un producto en un rango de fechas.
     * Query params: ide_inarti, fechaInicio, fechaFin, [ide_inmpre]
     */
    @Get('getComprobantesMenudeo')
    @ApiOperation({ summary: 'Listar comprobantes de menudeo de un producto en un rango de fechas' })
    getComprobantesMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: TrnMenudeoDto,
    ) {
        return this.service.getComprobantesMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Cabecera de un comprobante de menudeo.
     * Query param: ide_incmen
     */
    @Get('getCabMenudeo')
    @ApiOperation({ summary: 'Obtener cabecera de un comprobante de menudeo' })
    getCabMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdMenudeoDto,
    ) {
        return this.service.getCabMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Detalle de un comprobante de menudeo (presentaciones y cantidades).
     * Query param: ide_incmen
     */
    @Get('getDetMenudeo')
    @ApiOperation({ summary: 'Obtener detalle de un comprobante de menudeo (presentaciones y cantidades)' })
    getDetMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdMenudeoDto,
    ) {
        return this.service.getDetMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Kardex de menudeo de una presentación con saldo acumulado.
     * Query params: ide_inarti, ide_inmpre, fechaInicio, fechaFin
     */
    @Get('getKardexMenudeo')
    @ApiOperation({ summary: 'Obtener kardex de menudeo de una presentación con saldo acumulado' })
    getKardexMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: TrnMenudeoDto,
    ) {
        return this.service.getKardexMenudeo({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // FORMAS DE MENUDEO – SAVE
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza una forma de menudeo.
     * Si se incluye el array `insumos`, reemplaza completamente los insumos de la forma.
     */
    @Post('saveForma')
    @ApiOperation({ summary: 'Crear o actualizar una forma de menudeo con sus insumos' })
    saveForma(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveFormaDto,
    ) {
        return this.saveService.saveForma({ ...headersParams, ...dtoIn });
    }

    /**
     * Elimina una forma de menudeo y sus insumos (solo si no tiene productos vinculados).
     */
    @Delete('deleteForma')
    @ApiOperation({ summary: 'Eliminar una forma de menudeo y sus insumos (solo si no tiene productos vinculados)' })
    deleteForma(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdFormaDto,
    ) {
        return this.saveService.deleteForma({ ...headersParams, ...dtoIn });
    }

    /**
     * Elimina un insumo individual de una forma.
     * Query param: ide_inmfin
     */
    @Delete('deleteInsumoForma')
    @ApiOperation({ summary: 'Eliminar un insumo individual de una forma de menudeo' })
    deleteInsumoForma(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query('ide_inmfin') ide_inmfin: string,
    ) {
        return this.saveService.deleteInsumoForma({
            ...headersParams,
            ide_inmfin: parseInt(ide_inmfin),
        });
    }

    // ─────────────────────────────────────────────────────────────
    // TIPOS DE COMPROBANTE / TRANSACCIÓN – SAVE
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza un tipo de comprobante de menudeo (Ingreso/Egreso con signo).
     */
    @Post('saveTipoComp')
    @ApiOperation({ summary: 'Crear o actualizar un tipo de comprobante de menudeo (Ingreso/Egreso)' })
    saveTipoComp(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveTipoCompDto,
    ) {
        return this.saveService.saveTipoComp({ ...headersParams, ...dtoIn });
    }

    /**
     * Elimina un tipo de comprobante (solo si no tiene tipos de transacción vinculados).
     */
    @Delete('deleteTipoComp')
    @ApiOperation({ summary: 'Eliminar un tipo de comprobante de menudeo (solo si no tiene tipos de transacción vinculados)' })
    deleteTipoComp(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdTipoCompDto,
    ) {
        return this.saveService.deleteTipoComp({ ...headersParams, ...dtoIn });
    }

    /**
     * Crea o actualiza un tipo de transacción de menudeo.
     */
    @Post('saveTipoTran')
    @ApiOperation({ summary: 'Crear o actualizar un tipo de transacción de menudeo' })
    saveTipoTran(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveTipoTranDto,
    ) {
        return this.saveService.saveTipoTran({ ...headersParams, ...dtoIn });
    }

    /**
     * Elimina un tipo de transacción (solo si no tiene comprobantes vinculados).
     */
    @Delete('deleteTipoTran')
    @ApiOperation({ summary: 'Eliminar un tipo de transacción de menudeo (solo si no tiene comprobantes vinculados)' })
    deleteTipoTran(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdTipoTranDto,
    ) {
        return this.saveService.deleteTipoTran({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // PRESENTACIONES – SAVE
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza un vínculo producto ↔ forma de menudeo.
     * Opcionalmente incluye cant_base_inmpre como override del valor de la forma.
     */
    @Post('savePresentacion')
    @ApiOperation({ summary: 'Crear o actualizar vínculo producto–forma de menudeo (presentación)' })
    savePresentacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SavePresentacionDto,
    ) {
        return this.saveService.savePresentacion({ ...headersParams, ...dtoIn });
    }

    /**
     * Elimina un vínculo producto ↔ forma (solo si no tiene movimientos).
     */
    @Delete('deletePresentacion')
    @ApiOperation({ summary: 'Eliminar vínculo producto–forma de menudeo (solo si no tiene movimientos)' })
    deletePresentacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdPresentacionDto,
    ) {
        return this.saveService.deletePresentacion({ ...headersParams, ...dtoIn });
    }

    /**
     * Copia las presentaciones activas del producto origen a los productos destino.
     * Si el destino ya tiene asignada la misma forma se omite sin error.
     * Retorna el número total de presentaciones insertadas.
     */
    @Post('copiarPresentacion')
    @ApiOperation({ summary: 'Copiar presentaciones activas de un producto origen a productos destino' })
    copiarPresentacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: CopiarPresentacionDto,
    ) {
        return this.saveService.copiarPresentacion({ ...headersParams, ...dtoIn });
    }

    /**
     * Crea saldos iniciales de menudeo de forma masiva.
     * Agrupa los ítems por producto y genera un comprobante por cada uno.
     * El tipo de transacción Saldo Inicial (SI) se resuelve automáticamente.
     */
    @Post('saveSaldoInicialMenudeo')
    @ApiOperation({ summary: 'Crear saldos iniciales de menudeo masivos (un comprobante por producto)' })
    saveSaldoInicialMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveSaldoInicialMenudeoDto,
    ) {
        return this.saveService.saveSaldoInicialMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Ajusta el stock de menudeo a un saldo final deseado.
     * Calcula automáticamente la diferencia y genera Ajuste Ingreso o Ajuste Egreso
     * según corresponda. Ítems con saldo_final igual al actual se omiten.
     * Se crea un comprobante por cada combinación (producto, tipo de ajuste).
     */
    @Post('saveAjusteMenudeo')
    @ApiOperation({ summary: 'Ajustar stock de menudeo al saldo final deseado (genera ajuste ingreso o egreso automáticamente)' })
    saveAjusteMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveAjusteMenudeoDto,
    ) {
        return this.saveService.saveAjusteMenudeo({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // COMPROBANTES – SAVE
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea un comprobante de menudeo.
     * El tipo de transacción (ide_inmtt) determina el comportamiento:
     *   - Signo del movimiento (derivado de tipo_comp)
     *   - Si genera egreso de insumos/envases en inventario
     *   - Si genera egreso del producto base en inventario
     *
     * Para que se generen comprobantes de inventario automáticamente,
     * incluya `ide_inbod` dentro del objeto `data` y configure `ide_intti`
     * en el tipo de transacción correspondiente.
     */
    @Post('saveMenudeo')
    @ApiOperation({ summary: 'Crear comprobante de menudeo con tipo de transacción explícito' })
    saveMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveMenudeoDto,
    ) {
        return this.saveService.saveMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Crea un comprobante de Menudeo/Fraccionamiento de forma simplificada.
     * El tipo de transacción (MEN), ide_inarti y cant_base_indmen se resuelven automáticamente.
     * El numero_incmen se genera como YYYYMM + secuencial mensual (ej: 20260300001).
     */
    @Post('crearMenudeo')
    @ApiOperation({ summary: 'Crear comprobante de Menudeo/Fraccionamiento simplificado (tipo MEN, secuencial automático)' })
    crearMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: CrearMenudeoDto,
    ) {
        return this.saveService.crearMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Anula un comprobante de menudeo.
     * Body: { ide_incmen }
     */
    @Post('anularMenudeo')
    @ApiOperation({ summary: 'Anular un comprobante de menudeo' })
    anularMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: IdMenudeoDto,
    ) {
        return this.saveService.anularMenudeo({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // TABLE QUERY / LIST DATA – CATÁLOGOS MENUDEO
    // ─────────────────────────────────────────────────────────────

    @Get('getTableQueryMenForma')
    @ApiOperation({ summary: 'Obtener tabla de formas de menudeo para grilla' })
    getTableQueryMenForma(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTableQueryMenForma({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataMenForma')
    @ApiOperation({ summary: 'Obtener listado de formas de menudeo para selector' })
    getListDataMenForma(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getListDataMenForma({ ...headersParams, ...dtoIn });
    }

    @Get('getTableQueryMenFormaInsumo')
    @ApiOperation({ summary: 'Obtener tabla de insumos de una forma de menudeo para grilla' })
    getTableQueryMenFormaInsumo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdFormaDto,
    ) {
        return this.service.getTableQueryMenFormaInsumo({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataMenFormaInsumo')
    @ApiOperation({ summary: 'Obtener listado de insumos de una forma de menudeo para selector' })
    getListDataMenFormaInsumo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdFormaDto,
    ) {
        return this.service.getListDataMenFormaInsumo({ ...headersParams, ...dtoIn });
    }

    @Get('getTableQueryMenTipoComp')
    @ApiOperation({ summary: 'Obtener tabla de tipos de comprobante de menudeo para grilla' })
    getTableQueryMenTipoComp(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTableQueryMenTipoComp({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataMenTipoComp')
    @ApiOperation({ summary: 'Obtener listado de tipos de comprobante de menudeo para selector' })
    getListDataMenTipoComp(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getListDataMenTipoComp({ ...headersParams, ...dtoIn });
    }

    @Get('getTableQueryMenTipoTran')
    @ApiOperation({ summary: 'Obtener tabla de tipos de transacción de menudeo para grilla' })
    getTableQueryMenTipoTran(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTableQueryMenTipoTran({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataMenTipoTran')
    @ApiOperation({ summary: 'Obtener listado de tipos de transacción de menudeo para selector' })
    getListDataMenTipoTran(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdTipoCompDto,
    ) {
        return this.service.getListDataMenTipoTran({ ...headersParams, ...dtoIn });
    }

    @Get('getTableQueryMenPresentacion')
    @ApiOperation({ summary: 'Obtener tabla de presentaciones de menudeo de un producto para grilla' })
    getTableQueryMenPresentacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoMenudeoDto,
    ) {
        return this.service.getTableQueryMenPresentacion({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataMenPresentacion')
    @ApiOperation({ summary: 'Obtener listado de presentaciones de menudeo de un producto para selector' })
    getListDataMenPresentacion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoMenudeoDto,
    ) {
        return this.service.getListDataMenPresentacion({ ...headersParams, ...dtoIn });
    }
}
