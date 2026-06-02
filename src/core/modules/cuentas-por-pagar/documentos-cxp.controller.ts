import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { DocumentosCxPService } from './documentos-cxp.service';
import { AnularDocumentoCxPDto } from './dto/anular-documento-cxp.dto';
import { GetDocumentosCxPDto } from './dto/get-documentos-cxp.dto';
import { SaveDocumentoCxPDto } from './dto/save-documento-cxp.dto';

@ApiTags('CuentasPorPagar - Documentos')
@Controller('cuentas-por-pagar/documentos')
export class DocumentosCxPController {
    constructor(
        private readonly service: DocumentosCxPService,
        private readonly saveService: DocumentosCxPSaveService,
    ) { }

    // ─── CONSULTAS ────────────────────────────────────────────────────────────

    @Get('getListDataTiposDocumento')
    @ApiOperation({ summary: 'Listar tipos de documento CxP para combos' })
    getListDataTiposDocumento(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getListDataTiposDocumentoCxP();
    }

    @Get('getDocumentos')
    @ApiOperation({ summary: 'Listar documentos CxP en rango de fechas' })
    getDocumentos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDocumentosCxPDto,
    ) {
        return this.service.getDocumentos({ ...headersParams, ...dtoIn });
    }

    @Get('getDocumentoById/:ide_cpcfa')
    @ApiOperation({ summary: 'Obtener documento CxP completo por ID' })
    getDocumentoById(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ide_cpcfa') ide_cpcfa: number,
    ) {
        return this.service.getDocumentoById(ide_cpcfa);
    }

    @Get('getPagosDocumento/:ide_cpcfa')
    @ApiOperation({ summary: 'Listar pagos realizados a un documento CxP' })
    getPagosDocumento(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ide_cpcfa') ide_cpcfa: number,
    ) {
        return this.service.getPagosDocumento(ide_cpcfa);
    }

    @Get('getFormasPago')
    @ApiOperation({ summary: 'Listar formas de pago para combos' })
    getFormasPago(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getFormasPago();
    }

    @Get('getDiasCredito')
    @ApiOperation({ summary: 'Listar opciones de dias de credito para combos' })
    getDiasCredito(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getDiasCredito();
    }

    @Get('getMotivosNotaCredito')
    @ApiOperation({ summary: 'Listar motivos de nota de credito para combo' })
    getMotivosNotaCredito(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getMotivosNotaCredito();
    }

    @Get('getSustentoTributario')
    @ApiOperation({ summary: 'Listar sustento tributario para combo' })
    getSustentoTributario(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getSustentoTributario();
    }

    @Get('getPorcentajeIva')
    @ApiOperation({ summary: 'Obtener porcentaje de IVA vigente a una fecha' })
    getPorcentajeIva(
        @AppHeaders() _h: HeaderParamsDto,
        @Query('fecha') fecha: string,
    ) {
        return this.service.getPorcentajeIva(fecha);
    }

    @Get('existeDocumentoElectronico')
    @ApiOperation({ summary: 'Validar si ya existe un documento con esa autorizacion' })
    existeDocumentoElectronico(
        @AppHeaders() _h: HeaderParamsDto,
        @Query('autorizacion') autorizacion: string,
    ) {
        return this.service.existeDocumentoElectronico(autorizacion);
    }

    // ─── MUTACIONES ───────────────────────────────────────────────────────────

    @Post('saveDocumento')
    @ApiOperation({ summary: 'Crear o actualizar un documento CxP con sus detalles' })
    saveDocumento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveDocumentoCxPDto,
    ) {
        return this.saveService.saveDocumento({ ...headersParams, ...dtoIn });
    }

    @Post('anularDocumento')
    @ApiOperation({ summary: 'Anular un documento CxP y sus transacciones asociadas' })
    anularDocumento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularDocumentoCxPDto,
    ) {
        return this.saveService.anularDocumento({ ...headersParams, ...dtoIn });
    }
}
