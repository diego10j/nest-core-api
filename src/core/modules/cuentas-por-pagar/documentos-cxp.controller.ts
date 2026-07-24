import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';

import { DocumentosCxPSaveService } from './documentos-cxp-save.service';
import { DocumentosCxPXmlService } from './documentos-cxp-xml.service';
import { DocumentosCxPService } from './documentos-cxp.service';
import { AnticiposProveedorCxPDto } from './dto/anticipos-proveedor-cxp.dto';
import { AnularDocumentoCxPDto } from './dto/anular-documento-cxp.dto';
import { GenerarAsientosComprasDto } from './dto/generar-asientos-compras.dto';
import { GetDocumentosCxPDto } from './dto/get-documentos-cxp.dto';
import { PeriodoCxPDto, PeriodoMesCxPDto } from './dto/periodo-mes-cxp.dto';
import { ProveedoresCxPDto } from './dto/proveedores-cxp.dto';
import { SaldosProveedoresCxPDto } from './dto/saldos-proveedores-cxp.dto';
import { SaveDocumentoCxPDto } from './dto/save-documento-cxp.dto';

@ApiTags('CuentasPorPagar - Documentos')
@Controller('cuentas-por-pagar/documentos')
export class DocumentosCxPController {
    constructor(
        private readonly service: DocumentosCxPService,
        private readonly saveService: DocumentosCxPSaveService,
        private readonly xmlService: DocumentosCxPXmlService,
        private readonly asientosService: AsientosAutomaticosService,
    ) { }

    // ─── CONSULTAS ────────────────────────────────────────────────────────────

    @Get('getListDataTiposDocumento')
    @Auth()
    @ApiOperation({ summary: 'Listar tipos de documento CxP para combos' })
    getListDataTiposDocumento(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getListDataTiposDocumentoCxP();
    }

    @Get('getDocumentos')
    @Auth()
    @ApiOperation({ summary: 'Listar documentos CxP en rango de fechas' })
    getDocumentos(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDocumentosCxPDto,
    ) {
        return this.service.getDocumentos({ ...headersParams, ...dtoIn });
    }

    @Get('getDocumentoById/:ide_cpcfa')
    @Auth()
    @ApiOperation({ summary: 'Obtener documento CxP completo por ID' })
    getDocumentoById(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ide_cpcfa') ide_cpcfa: number,
    ) {
        return this.service.getDocumentoById(ide_cpcfa);
    }

    @Get('getPagosDocumento/:ide_cpcfa')
    @Auth()
    @ApiOperation({ summary: 'Listar pagos realizados a un documento CxP' })
    getPagosDocumento(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ide_cpcfa') ide_cpcfa: number,
    ) {
        return this.service.getPagosDocumento(ide_cpcfa);
    }

    @Get('getFormasPago')
    @Auth()
    @ApiOperation({ summary: 'Listar formas de pago para combos' })
    getFormasPago(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getFormasPago();
    }

    @Get('getDiasCredito')
    @Auth()
    @ApiOperation({ summary: 'Listar opciones de dias de credito para combos' })
    getDiasCredito(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getDiasCredito();
    }

    @Get('getMotivosNotaCredito')
    @Auth()
    @ApiOperation({ summary: 'Listar motivos de nota de credito para combo' })
    getMotivosNotaCredito(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getMotivosNotaCredito();
    }

    @Get('getSustentoTributario')
    @Auth()
    @ApiOperation({ summary: 'Listar sustento tributario para combo' })
    getSustentoTributario(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getSustentoTributario();
    }

    @Get('getProveedoresDocumento')
    @Auth()
    @ApiOperation({ summary: 'Listar proveedores filtrados por tipo de documento CxP' })
    getProveedoresDocumento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: ProveedoresCxPDto,
    ) {
        return this.service.getProveedoresDocumento({ ...headersParams, ...dtoIn });
    }

    @Get('getAnticiposProveedor')
    @Auth()
    @ApiOperation({ summary: 'Listar anticipos del proveedor sin documento asociado' })
    getAnticiposProveedor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: AnticiposProveedorCxPDto,
    ) {
        return this.service.getAnticiposProveedor({ ...headersParams, ...dtoIn });
    }

    @Get('getSecuencialLiquidacion')
    @Auth()
    @ApiOperation({ summary: 'Obtener el siguiente secuencial de liquidación de compra' })
    getSecuencialLiquidacion(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getSecuencialLiquidacion(headersParams);
    }

    @Get('getDocumentosAnulados')
    @Auth()
    @ApiOperation({ summary: 'Listar documentos CxP anulados en rango de fechas' })
    getDocumentosAnulados(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDocumentosCxPDto,
    ) {
        return this.service.getDocumentosAnulados({ ...headersParams, ...dtoIn });
    }

    @Get('getDocumentosNoContabilizados')
    @Auth()
    @ApiOperation({ summary: 'Listar documentos CxP sin asiento contable en un mes/período' })
    getDocumentosNoContabilizados(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: PeriodoMesCxPDto,
    ) {
        return this.service.getDocumentosNoContabilizados({ ...headersParams, ...dtoIn });
    }

    @Get('getDocumentosNoRetencion')
    @Auth()
    @ApiOperation({ summary: 'Listar documentos CxP sin comprobante de retención' })
    getDocumentosNoRetencion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetDocumentosCxPDto,
    ) {
        return this.service.getDocumentosNoRetencion({ ...headersParams, ...dtoIn });
    }

    @Get('getDocumentosModificablesProveedor')
    @Auth()
    @ApiOperation({ summary: 'Listar documentos del proveedor dentro de la ventana de modificación' })
    getDocumentosModificablesProveedor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: AnticiposProveedorCxPDto,
    ) {
        return this.service.getDocumentosModificablesProveedor({ ...headersParams, ...dtoIn });
    }

    @Get('getComprasMensuales')
    @Auth()
    @ApiOperation({ summary: 'Reporte de facturas de compra de un mes' })
    getComprasMensuales(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: PeriodoMesCxPDto,
    ) {
        return this.service.getComprasMensuales({ ...headersParams, ...dtoIn });
    }

    @Get('getNotasCreditoMensuales')
    @Auth()
    @ApiOperation({ summary: 'Reporte de notas de crédito de compras de un mes' })
    getNotasCreditoMensuales(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: PeriodoMesCxPDto,
    ) {
        return this.service.getNotasCreditoMensuales({ ...headersParams, ...dtoIn });
    }

    @Get('getComprasDetalladasMensuales')
    @Auth()
    @ApiOperation({ summary: 'Reporte detallado (por artículo) de compras de un mes' })
    getComprasDetalladasMensuales(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: PeriodoMesCxPDto,
    ) {
        return this.service.getComprasDetalladasMensuales({ ...headersParams, ...dtoIn });
    }

    @Get('getTotalComprasMensuales')
    @Auth()
    @ApiOperation({ summary: 'Totales de compras por mes de un período (gráfico)' })
    getTotalComprasMensuales(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: PeriodoCxPDto,
    ) {
        return this.service.getTotalComprasMensuales({ ...headersParams, ...dtoIn });
    }

    @Get('getSaldosProveedores')
    @Auth()
    @ApiOperation({ summary: 'Saldos por pagar de los proveedores a una fecha de corte' })
    getSaldosProveedores(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: SaldosProveedoresCxPDto,
    ) {
        return this.service.getSaldosProveedores({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataTipoIva')
    @Auth()
    @ApiOperation({ summary: 'Combo estático de tipos de IVA del detalle' })
    getListDataTipoIva(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getListDataTipoIva();
    }

    @Get('getListDataMeses')
    @Auth()
    @ApiOperation({ summary: 'Combo de meses' })
    getListDataMeses(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataMeses(headersParams);
    }

    @Get('getListDataAniosFacturacion')
    @Auth()
    @ApiOperation({ summary: 'Combo de años con documentos CxP registrados' })
    getListDataAniosFacturacion(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataAniosFacturacion(headersParams);
    }

    @Get('getPorcentajeIva')
    @Auth()
    @ApiOperation({ summary: 'Obtener porcentaje de IVA vigente a una fecha' })
    getPorcentajeIva(
        @AppHeaders() _h: HeaderParamsDto,
        @Query('fecha') fecha: string,
    ) {
        return this.service.getPorcentajeIva(fecha);
    }

    @Get('existeDocumentoElectronico')
    @Auth()
    @ApiOperation({ summary: 'Validar si ya existe un documento con esa autorizacion' })
    existeDocumentoElectronico(
        @AppHeaders() _h: HeaderParamsDto,
        @Query('autorizacion') autorizacion: string,
    ) {
        return this.service.existeDocumentoElectronico(autorizacion);
    }

    // ─── MUTACIONES ───────────────────────────────────────────────────────────

    @Post('saveDocumento')
    @Auth()
    @ApiOperation({ summary: 'Crear o actualizar un documento CxP con sus detalles' })
    saveDocumento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveDocumentoCxPDto,
    ) {
        return this.saveService.saveDocumento({ ...headersParams, ...dtoIn });
    }

    @Post('generarAsientosCompras')
    @Auth()
    @ApiOperation({ summary: 'Generar el asiento contable de uno o varios documentos CxP' })
    async generarAsientosCompras(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: GenerarAsientosComprasDto,
    ) {
        const resultados = [];
        for (const ideCpcfa of dtoIn.ide) {
            resultados.push(
                await this.asientosService.generarAsientoComprasCxP({
                    ...headersParams,
                    ide_cpcfa: ideCpcfa,
                }),
            );
        }
        return resultados;
    }

    @Post('anularDocumento')
    @Auth()
    @ApiOperation({ summary: 'Anular un documento CxP y sus transacciones asociadas' })
    anularDocumento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularDocumentoCxPDto,
    ) {
        return this.saveService.anularDocumento({ ...headersParams, ...dtoIn });
    }

    @Post('importarXML')
    @Auth()
    @ApiOperation({
        summary: 'Parsear un XML de factura electrónica SRI y retornar la data para el formulario (no guarda)',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            const esXml = file.originalname.toLowerCase().endsWith('.xml')
                || file.mimetype === 'text/xml'
                || file.mimetype === 'application/xml';
            cb(esXml ? null : new BadRequestException('Solo se permiten archivos XML'), esXml);
        },
    }))
    importarXML(
        @AppHeaders() headersParams: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Debe seleccionar un archivo XML');
        return this.xmlService.parseFacturaXml(file.buffer, headersParams);
    }
}
