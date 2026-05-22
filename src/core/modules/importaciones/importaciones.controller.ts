import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ImportacionesService } from './importaciones.service';
import { ImportacionesSaveService } from './importaciones-save.service';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { GetImportacionesDto } from './dto/get-importaciones.dto';
import { SaveCostoImportDto } from './dto/save-costo-import.dto';
import { SaveDistribucionCostoDto } from './dto/save-distribucion-costo.dto';
import { SaveDocumentoDto } from './dto/save-documento.dto';
import { SaveEnvioDto } from './dto/save-envio.dto';
import { SaveGestionAduanaDto } from './dto/save-gestion-aduana.dto';
import { SaveImportacionDto } from './dto/save-importacion.dto';
import { SaveLiquidacionAduanaDto } from './dto/save-liquidacion-aduana.dto';
import { SavePagoImportDto } from './dto/save-pago-import.dto';
import { SetActivoDto } from './dto/set-activo.dto';

@ApiTags('Importaciones')
@Controller('importaciones')
export class ImportacionesController {
    constructor(
        private readonly service: ImportacionesService,
        private readonly saveService: ImportacionesSaveService,
    ) { }

    // ========================================================================
    // CATÁLOGOS — GET sin parámetros
    // ========================================================================

    @Get('getListDataIncoterm')
    @ApiOperation({ summary: 'Listar Incoterms activos para combos' })
    getListDataIncoterm() { return this.service.getListDataIncoterm(); }

    @Get('getListDataEstadoOrden')
    @ApiOperation({ summary: 'Listar estados de orden activos para combos' })
    getListDataEstadoOrden() { return this.service.getListDataEstadoOrden(); }

    @Get('getListDataTipoCosto')
    @ApiOperation({ summary: 'Listar tipos de costo activos para combos' })
    getListDataTipoCosto() { return this.service.getListDataTipoCosto(); }

    @Get('getListDataTipoDocumento')
    @ApiOperation({ summary: 'Listar tipos de documento activos para combos' })
    getListDataTipoDocumento() { return this.service.getListDataTipoDocumento(); }

    @Get('getListDataTipoTransporte')
    @ApiOperation({ summary: 'Listar tipos de transporte activos para combos' })
    getListDataTipoTransporte() { return this.service.getListDataTipoTransporte(); }

    @Get('getListDataEstadoEnvio')
    @ApiOperation({ summary: 'Listar estados de envío activos para combos' })
    getListDataEstadoEnvio() { return this.service.getListDataEstadoEnvio(); }

    @Get('getListDataTipoAforo')
    @ApiOperation({ summary: 'Listar tipos de aforo activos para combos' })
    getListDataTipoAforo() { return this.service.getListDataTipoAforo(); }

    // ========================================================================
    // CONSULTAS — GET con @Query
    // ========================================================================

    @Get('getImportaciones')
    @ApiOperation({ summary: 'Listar órdenes de importación con filtros de fecha/estado' })
    getImportaciones(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetImportacionesDto) {
        return this.service.getImportaciones({ ...h, ...dto });
    }

    @Get('getImportacionById/:ide_imcaim')
    @ApiOperation({ summary: 'Obtener cabecera completa de una importación por ID' })
    getImportacionById(@Param('ide_imcaim') id: number) {
        return this.service.getImportacionById(id);
    }

    @Get('getDetalleImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar productos del detalle de una importación' })
    getDetalleImportacion(@Param('ide_imcaim') id: number) {
        return this.service.getDetalleImportacion(id);
    }

    @Get('getCostosImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar costos de una importación' })
    getCostosImportacion(@Param('ide_imcaim') id: number) {
        return this.service.getCostosImportacion(id);
    }

    @Get('getPagosImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar pagos de una importación' })
    getPagosImportacion(@Param('ide_imcaim') id: number) {
        return this.service.getPagosImportacion(id);
    }

    @Get('getDocumentosImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar documentos de una importación' })
    getDocumentosImportacion(@Param('ide_imcaim') id: number) {
        return this.service.getDocumentosImportacion(id);
    }

    @Get('getEnvioImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Obtener información de envío de una importación' })
    getEnvioImportacion(@Param('ide_imcaim') id: number) {
        return this.service.getEnvioImportacion(id);
    }

    @Get('getGestionAduana/:ide_imcaim')
    @ApiOperation({ summary: 'Obtener gestión aduana de una importación' })
    getGestionAduana(@Param('ide_imcaim') id: number) {
        return this.service.getGestionAduana(id);
    }

    @Get('getLiquidacionAduana/:ide_imga')
    @ApiOperation({ summary: 'Obtener liquidación de aduana por gestión' })
    getLiquidacionAduana(@Param('ide_imga') id: number) {
        return this.service.getLiquidacionAduana(id);
    }

    @Get('getResumenCostos/:ide_imcaim')
    @ApiOperation({ summary: 'Resumen de costos agrupados por tipo' })
    getResumenCostos(@Param('ide_imcaim') id: number) {
        return this.service.getResumenCostos(id);
    }

    @Get('getHistorialEstado/:ide_imcaim')
    @ApiOperation({ summary: 'Historial de cambios de estado de una importación' })
    getHistorialEstado(@Param('ide_imcaim') id: number) {
        return this.service.getHistorialEstado(id);
    }

    @Get('getDistribucionCostos/:ide_imcaim')
    @ApiOperation({ summary: 'Distribución de costos por producto de una importación' })
    getDistribucionCostos(@Param('ide_imcaim') id: number) {
        return this.service.getDistribucionCostos(id);
    }

    // ========================================================================
    // MUTACIONES — POST con @Body
    // ========================================================================

    @Post('saveImportacion')
    @ApiOperation({ summary: 'Crear o actualizar una orden de importación con sus detalles' })
    saveImportacion(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveImportacionDto) {
        return this.saveService.saveImportacion({ ...h, ...dto });
    }

    @Post('saveEnvio')
    @ApiOperation({ summary: 'Crear o actualizar datos de envío de una importación' })
    saveEnvio(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveEnvioDto) {
        return this.saveService.saveEnvio({ ...h, ...dto });
    }

    @Post('saveGestionAduana')
    @ApiOperation({ summary: 'Crear o actualizar gestión aduana de una importación' })
    saveGestionAduana(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveGestionAduanaDto) {
        return this.saveService.saveGestionAduana({ ...h, ...dto });
    }

    @Post('saveLiquidacionAduana')
    @ApiOperation({ summary: 'Crear o actualizar liquidación de aduana' })
    saveLiquidacionAduana(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveLiquidacionAduanaDto) {
        return this.saveService.saveLiquidacionAduana({ ...h, ...dto });
    }

    @Post('saveCosto')
    @ApiOperation({ summary: 'Crear o actualizar un costo de importación' })
    saveCosto(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveCostoImportDto) {
        return this.saveService.saveCosto({ ...h, ...dto });
    }

    @Post('deleteCosto')
    @ApiOperation({ summary: 'Desactivar un costo de importación (soft delete)' })
    deleteCosto(@AppHeaders() h: HeaderParamsDto, @Body() dto: { ide_imcoim: number }) {
        return this.saveService.deleteCosto(dto.ide_imcoim, h.login);
    }

    @Post('savePago')
    @ApiOperation({ summary: 'Crear o actualizar un pago de importación' })
    savePago(@AppHeaders() h: HeaderParamsDto, @Body() dto: SavePagoImportDto) {
        return this.saveService.savePago({ ...h, ...dto });
    }

    @Post('deletePago')
    @ApiOperation({ summary: 'Desactivar un pago de importación (soft delete)' })
    deletePago(@AppHeaders() h: HeaderParamsDto, @Body() dto: { ide_impag: number }) {
        return this.saveService.deletePago(dto.ide_impag, h.login);
    }

    @Post('saveDocumento')
    @ApiOperation({ summary: 'Crear o actualizar un documento de importación' })
    saveDocumento(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveDocumentoDto) {
        return this.saveService.saveDocumento({ ...h, ...dto });
    }

    @Post('cambiarEstado')
    @ApiOperation({ summary: 'Cambiar el estado de una importación (con registro en historial)' })
    cambiarEstado(@AppHeaders() h: HeaderParamsDto, @Body() dto: CambiarEstadoDto) {
        return this.saveService.cambiarEstado({ ...h, ...dto });
    }

    @Post('deleteImportacion')
    @ApiOperation({ summary: 'Desactivar una importación (soft delete)' })
    deleteImportacion(@AppHeaders() h: HeaderParamsDto, @Body() dto: { ide_imcaim: number }) {
        return this.saveService.deleteImportacion(dto.ide_imcaim, h.login);
    }

    @Post('distribuirCostos')
    @ApiOperation({ summary: 'Distribuir costos de importacion entre productos del detalle' })
    distribuirCostos(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveDistribucionCostoDto) {
        return this.saveService.distribuirCostos({ ...h, ...dto });
    }

    // ========================================================================
    // SET ACTIVO — toggle bool en columna activo_* para todas las tablas
    // ========================================================================

    @Post('setActivoIncoterm')
    @ApiOperation({ summary: 'Activar/desactivar un Incoterm' })
    setActivoIncoterm(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoIncoterm({ ...h, ...dto });
    }

    @Post('setActivoEstadoOrden')
    @ApiOperation({ summary: 'Activar/desactivar un estado de orden' })
    setActivoEstadoOrden(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoEstadoOrden({ ...h, ...dto });
    }

    @Post('setActivoTipoCosto')
    @ApiOperation({ summary: 'Activar/desactivar un tipo de costo' })
    setActivoTipoCosto(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoTipoCosto({ ...h, ...dto });
    }

    @Post('setActivoTipoDocumento')
    @ApiOperation({ summary: 'Activar/desactivar un tipo de documento' })
    setActivoTipoDocumento(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoTipoDocumento({ ...h, ...dto });
    }

    @Post('setActivoTipoTransporte')
    @ApiOperation({ summary: 'Activar/desactivar un tipo de transporte' })
    setActivoTipoTransporte(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoTipoTransporte({ ...h, ...dto });
    }

    @Post('setActivoEstadoEnvio')
    @ApiOperation({ summary: 'Activar/desactivar un estado de envio' })
    setActivoEstadoEnvio(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoEstadoEnvio({ ...h, ...dto });
    }

    @Post('setActivoTipoAforo')
    @ApiOperation({ summary: 'Activar/desactivar un tipo de aforo' })
    setActivoTipoAforo(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoTipoAforo({ ...h, ...dto });
    }

    @Post('setActivoImportacion')
    @ApiOperation({ summary: 'Activar/desactivar una importacion (soft delete)' })
    setActivoImportacion(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoImportacion({ ...h, ...dto });
    }

    @Post('setActivoCosto')
    @ApiOperation({ summary: 'Activar/desactivar un costo de importacion' })
    setActivoCosto(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoCosto({ ...h, ...dto });
    }

    @Post('setActivoPago')
    @ApiOperation({ summary: 'Activar/desactivar un pago de importacion' })
    setActivoPago(@AppHeaders() h: HeaderParamsDto, @Body() dto: SetActivoDto) {
        return this.saveService.setActivoPago({ ...h, ...dto });
    }
}
