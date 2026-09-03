import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { AnularRetencionVentaDto, EditarRetencionVentaDto, SaveRetencionVentaDto } from './dto/save-retencion-venta.dto';
import { RetencionVentaSaveService } from './retencion-venta-save.service';
import { RetencionVentaXmlService } from './retencion-venta-xml.service';

@ApiTags('Ventas - Retenciones')
@Controller('ventas/facturas/retenciones')
export class RetencionVentaController {
    constructor(
        private readonly xmlService: RetencionVentaXmlService,
        private readonly saveService: RetencionVentaSaveService,
    ) { }

    @Post('importarXML')
    @Auth()
    @ApiOperation({
        summary: 'Parsea y valida un XML de comprobante de retención (codDoc=07) recibido de un tercero (ej. Bendo) y arma el resumen para confirmar el guardado. No persiste nada.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: { file: { type: 'string', format: 'binary' } },
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
        return this.xmlService.parseRetencionXml(file.buffer, headersParams);
    }

    @Post('saveRetencion')
    @Auth()
    @ApiOperation({ summary: 'Registrar el comprobante de retención de una factura de venta' })
    saveRetencion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveRetencionVentaDto,
    ) {
        return this.saveService.saveRetencion({ ...headersParams, ...dtoIn });
    }

    @Post('anularRetencion')
    @Auth()
    @ApiOperation({ summary: 'Anular el comprobante de retención de una factura de venta' })
    anularRetencion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularRetencionVentaDto,
    ) {
        return this.saveService.anularRetencion({ ...headersParams, ...dtoIn });
    }

    @Post('editarRetencion')
    @Auth()
    @ApiOperation({ summary: 'Editar el comprobante de retención ya registrado de una factura de venta' })
    editarRetencion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: EditarRetencionVentaDto,
    ) {
        return this.saveService.editarRetencion({ ...headersParams, ...dtoIn });
    }
}
