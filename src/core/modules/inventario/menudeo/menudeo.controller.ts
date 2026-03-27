import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { MenudeoSaveService } from './menudeo-save.service';
import { MenudeoService } from './menudeo.service';
import { IdFormaDto } from './dto/id-forma.dto';
import { IdMenudeoDto } from './dto/id-menudeo.dto';
import { IdPresentacionDto } from './dto/id-presentacion.dto';
import { IdProductoMenudeoDto } from './dto/id-producto-menudeo.dto';
import { IdTipoCompDto } from './dto/id-tipo-comp.dto';
import { IdTipoTranDto } from './dto/id-tipo-tran.dto';
import { SaveFormaDto } from './dto/save-forma.dto';
import { SaveMenudeoDto } from './dto/save-menudeo.dto';
import { SavePresentacionDto } from './dto/save-presentacion.dto';
import { SaveAjusteMenudeoDto } from './dto/save-ajuste-menudeo.dto';
import { SaveSaldoInicialMenudeoDto } from './dto/save-saldo-inicial-menudeo.dto';
import { CopiarPresentacionDto } from './dto/copiar-presentacion.dto';
import { SaveTipoCompDto, SaveTipoTranDto } from './dto/save-tipo.dto';
import { TrnMenudeoDto } from './dto/trn-menudeo.dto';

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
    getProductosConMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getProductosConMenudeo({ ...headersParams, ...dtoIn });
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
    getAlertasStockMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getAlertasStockMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna el saldo actual de menudeo por presentación de un producto.
     * Query param: ide_inarti
     */
    @Get('getSaldosMenudeoProducto')
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
    saveMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveMenudeoDto,
    ) {
        return this.saveService.saveMenudeo({ ...headersParams, ...dtoIn });
    }

    /**
     * Anula un comprobante de menudeo.
     * Body: { ide_incmen }
     */
    @Post('anularMenudeo')
    anularMenudeo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: IdMenudeoDto,
    ) {
        return this.saveService.anularMenudeo({ ...headersParams, ...dtoIn });
    }
}
