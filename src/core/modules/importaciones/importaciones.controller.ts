import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { AsignarFacturaCxpDto } from './dto/asignar-factura-cxp.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { CrearFacturaCxpImportDto } from './dto/crear-factura-cxp-import.dto';
import { DeleteCostoDto } from './dto/delete-costo.dto';
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
import { ImportacionesSaveService } from './importaciones-save.service';
import { ImportacionesService } from './importaciones.service';

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
    getListDataIncoterm(@AppHeaders() _h: HeaderParamsDto) { return this.service.getListDataIncoterm(); }

    @Get('getTableQueryIncoterm')
    @ApiOperation({ summary: 'Tabla completa de Incoterms para administración' })
    getTableQueryIncoterm(@AppHeaders() h: HeaderParamsDto, @Query() dto: QueryOptionsDto) {
        return this.service.getTableQueryIncoterm({ ...h, ...dto });
    }

    @Get('getListDataEstadoOrden')
    @ApiOperation({ summary: 'Listar estados de orden activos para combos' })
    getListDataEstadoOrden(@AppHeaders() _h: HeaderParamsDto) { return this.service.getListDataEstadoOrden(); }

    @Get('getTableQueryEstadoOrden')
    @ApiOperation({ summary: 'Tabla completa de estados de orden para administración' })
    getTableQueryEstadoOrden(@AppHeaders() h: HeaderParamsDto, @Query() dto: QueryOptionsDto) {
        return this.service.getTableQueryEstadoOrden({ ...h, ...dto });
    }

    @Get('getListDataTipoCosto')
    @ApiOperation({ summary: 'Listar tipos de costo activos para combos' })
    getListDataTipoCosto(@AppHeaders() _h: HeaderParamsDto) { return this.service.getListDataTipoCosto(); }

    @Get('getTableQueryTipoCosto')
    @ApiOperation({ summary: 'Tabla completa de tipos de costo para administración' })
    getTableQueryTipoCosto(@AppHeaders() h: HeaderParamsDto, @Query() dto: QueryOptionsDto) {
        return this.service.getTableQueryTipoCosto({ ...h, ...dto });
    }

    @Get('getListDataTipoDocumento')
    @ApiOperation({ summary: 'Listar tipos de documento activos para combos' })
    getListDataTipoDocumento(@AppHeaders() _h: HeaderParamsDto) { return this.service.getListDataTipoDocumento(); }

    @Get('getTableQueryTipoDocumento')
    @ApiOperation({ summary: 'Tabla completa de tipos de documento para administración' })
    getTableQueryTipoDocumento(@AppHeaders() h: HeaderParamsDto, @Query() dto: QueryOptionsDto) {
        return this.service.getTableQueryTipoDocumento({ ...h, ...dto });
    }

    @Get('getListDataTipoTransporte')
    @ApiOperation({ summary: 'Listar tipos de transporte activos para combos' })
    getListDataTipoTransporte(@AppHeaders() _h: HeaderParamsDto) { return this.service.getListDataTipoTransporte(); }

    @Get('getTableQueryTipoTransporte')
    @ApiOperation({ summary: 'Tabla completa de tipos de transporte para administración' })
    getTableQueryTipoTransporte(@AppHeaders() h: HeaderParamsDto, @Query() dto: QueryOptionsDto) {
        return this.service.getTableQueryTipoTransporte({ ...h, ...dto });
    }

    @Get('getListDataEstadoEnvio')
    @ApiOperation({ summary: 'Listar estados de envío activos para combos' })
    getListDataEstadoEnvio(@AppHeaders() _h: HeaderParamsDto) { return this.service.getListDataEstadoEnvio(); }

    @Get('getTableQueryEstadoEnvio')
    @ApiOperation({ summary: 'Tabla completa de estados de envío para administración' })
    getTableQueryEstadoEnvio(@AppHeaders() h: HeaderParamsDto, @Query() dto: QueryOptionsDto) {
        return this.service.getTableQueryEstadoEnvio({ ...h, ...dto });
    }

    @Get('getListDataTipoAforo')
    @ApiOperation({ summary: 'Listar tipos de aforo activos para combos' })
    getListDataTipoAforo(@AppHeaders() _h: HeaderParamsDto) { return this.service.getListDataTipoAforo(); }

    @Get('getTableQueryTipoAforo')
    @ApiOperation({ summary: 'Tabla completa de tipos de aforo para administración' })
    getTableQueryTipoAforo(@AppHeaders() h: HeaderParamsDto, @Query() dto: QueryOptionsDto) {
        return this.service.getTableQueryTipoAforo({ ...h, ...dto });
    }

    // ========================================================================
    // CONSULTAS — GET con @Query o @Param (todos reciben @AppHeaders)
    // ========================================================================

    @Get('getImportaciones')
    @ApiOperation({ summary: 'Listar órdenes de importación con filtros de fecha/estado' })
    getImportaciones(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetImportacionesDto) {
        return this.service.getImportaciones({ ...h, ...dto });
    }

    @Get('getImportacionById/:ide_imcaim')
    @ApiOperation({ summary: 'Obtener cabecera completa de una importación por ID' })
    getImportacionById(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getImportacionById(id, h);
    }

    @Get('getDetalleImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar productos del detalle de una importación' })
    getDetalleImportacion(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getDetalleImportacion(id, h);
    }

    @Get('getCostosImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar costos de una importación (sin factura)' })
    getCostosImportacion(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getCostosImportacion(id, h);
    }

    @Get('getFacturasImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar costos-factura de una importación con datos de factura CxP' })
    getFacturasImportacion(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getFacturasImportacion(id, h);
    }

    @Get('getPagosImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar pagos de una importación' })
    getPagosImportacion(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getPagosImportacion(id, h);
    }

    @Get('getDocumentosImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Listar documentos de una importación' })
    getDocumentosImportacion(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getDocumentosImportacion(id, h);
    }

    @Get('getEnvioImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Obtener información de envío de una importación' })
    getEnvioImportacion(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getEnvioImportacion(id, h);
    }

    @Get('getGestionAduana/:ide_imcaim')
    @ApiOperation({ summary: 'Obtener gestión aduana de una importación' })
    getGestionAduana(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getGestionAduana(id, h);
    }

    @Get('getLiquidacionAduana/:ide_imga')
    @ApiOperation({ summary: 'Obtener liquidación de aduana por gestión' })
    getLiquidacionAduana(@AppHeaders() h: HeaderParamsDto, @Param('ide_imga', ParseIntPipe) id: number) {
        return this.service.getLiquidacionAduana(id, h);
    }

    @Get('getResumenCostos/:ide_imcaim')
    @ApiOperation({ summary: 'Resumen de costos agrupados por tipo' })
    getResumenCostos(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getResumenCostos(id, h);
    }

    @Get('getHistorialEstado/:ide_imcaim')
    @ApiOperation({ summary: 'Historial de cambios de estado de una importación' })
    getHistorialEstado(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getHistorialEstado(id, h);
    }

    @Get('getDistribucionCostos/:ide_imcaim')
    @ApiOperation({ summary: 'Distribución de costos por producto de una importación' })
    getDistribucionCostos(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getDistribucionCostos(id, h);
    }

    @Get('getFacturaImportacion/:ide_imcaim')
    @ApiOperation({ summary: 'Factura CxP asignada a una orden de importación con sus detalles' })
    getFacturaImportacion(@AppHeaders() h: HeaderParamsDto, @Param('ide_imcaim', ParseIntPipe) id: number) {
        return this.service.getFacturaImportacion(id, h);
    }

    @Get('getFacturasImportaciones')
    @ApiOperation({ summary: 'Facturas CxP tipo 11 del proveedor no asignadas a ninguna importación' })
    getFacturasImportaciones(
        @AppHeaders() h: HeaderParamsDto,
        @Query('ide_geper', ParseIntPipe) ide_geper: number,
    ) {
        return this.service.getFacturasImportaciones(ide_geper, h.ideEmpr);
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
    @ApiOperation({ summary: 'Eliminar un costo de importación (delete físico)' })
    deleteCosto(@AppHeaders() h: HeaderParamsDto, @Body() dto: DeleteCostoDto) {
        return this.saveService.deleteCosto(dto.ide_imcoim);
    }

    @Post('savePago')
    @ApiOperation({ summary: 'Crear o actualizar un pago de importación' })
    savePago(@AppHeaders() h: HeaderParamsDto, @Body() dto: SavePagoImportDto) {
        return this.saveService.savePago({ ...h, ...dto });
    }

    @Post('deletePago')
    @ApiOperation({ summary: 'Desactivar un pago de importación (soft delete)' })
    deletePago(@AppHeaders() h: HeaderParamsDto, @Body() dto: { ide_impag: number }) {
        return this.saveService.deletePago(dto.ide_impag);
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
        return this.saveService.deleteImportacion(dto.ide_imcaim);
    }

    @Post('distribuirCostos')
    @ApiOperation({ summary: 'Distribuir costos de importacion entre productos del detalle' })
    distribuirCostos(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveDistribucionCostoDto) {
        return this.saveService.distribuirCostos({ ...h, ...dto });
    }

    @Post('crearFacturaCxpImportacion')
    @ApiOperation({ summary: 'Crear o actualizar la factura CxP (doc. importación) de una orden' })
    crearFacturaCxpImportacion(@AppHeaders() h: HeaderParamsDto, @Body() dto: CrearFacturaCxpImportDto) {
        return this.saveService.crearFacturaCxpImportacion(dto.ide_imcaim, h);
    }

    @Post('asignarFacturaCxp')
    @ApiOperation({ summary: 'Asignar una factura CxP tipo 11 existente a una orden de importación' })
    asignarFacturaCxp(@AppHeaders() h: HeaderParamsDto, @Body() dto: AsignarFacturaCxpDto) {
        return this.saveService.asignarFacturaCxp(dto.ide_imcaim, dto.ide_cpcfa, h.login);
    }

    @Post('desasignarFacturaCxp')
    @ApiOperation({ summary: 'Desasignar (desvincular) la factura CxP de una orden de importación' })
    desasignarFacturaCxp(@AppHeaders() h: HeaderParamsDto, @Body() dto: CrearFacturaCxpImportDto) {
        return this.saveService.desasignarFacturaCxp(dto.ide_imcaim, h.login);
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
