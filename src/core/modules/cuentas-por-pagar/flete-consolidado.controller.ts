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

import { CrearFacturaFleteConsolidadaDto } from './dto/crear-factura-flete-consolidada.dto';
import { GetEnviosSinFacturaDto } from './dto/get-envios-sin-factura.dto';
import { GetFletesConsolidadosDto } from './dto/get-fletes-consolidados.dto';
import { IdFleteConsolidadoDto, MarcarPagadoFleteConsolidadoDto } from './dto/id-flete-consolidado.dto';
import { PrepararXmlFleteConsolidadoDto } from './dto/preparar-xml-flete-consolidado.dto';
import { FleteConsolidadoSaveService } from './flete-consolidado-save.service';
import { FleteConsolidadoService } from './flete-consolidado.service';

@ApiTags('CuentasPorPagar - Factura Consolidada de Flete')
@Controller('cuentas-por-pagar/flete-consolidado')
export class FleteConsolidadoController {
    constructor(
        private readonly service: FleteConsolidadoService,
        private readonly saveService: FleteConsolidadoSaveService,
    ) { }

    @Get('getEnviosSinFacturaPorProveedor')
    @Auth()
    @ApiOperation({ summary: 'Envíos de un transportista sin factura de flete, en un rango de fechas' })
    getEnviosSinFacturaPorProveedor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetEnviosSinFacturaDto,
    ) {
        return this.service.getEnviosSinFacturaPorProveedor({ ...headersParams, ...dtoIn });
    }

    @Post('envios/prepararFacturaFleteConsolidada')
    @Auth()
    @ApiOperation({
        summary: 'Parsea el XML consolidado, empareja (GPT) cada línea con el envío que le corresponde, y arma la data para el visualizador (no guarda)',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                ideCctfas: { type: 'string', example: '12,13,14' },
            },
            required: ['file', 'ideCctfas'],
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
    prepararFacturaFleteConsolidada(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: PrepararXmlFleteConsolidadoDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Debe seleccionar un archivo XML');
        return this.service.prepararFacturaFleteConsolidadaDesdeXml(dtoIn.ideCctfas, file.buffer, headersParams);
    }

    @Post('crearFacturaFleteConsolidada')
    @Auth()
    @ApiOperation({ summary: 'Crea la factura CxP consolidada y vincula los envíos incluidos' })
    crearFacturaFleteConsolidada(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: CrearFacturaFleteConsolidadaDto,
    ) {
        return this.saveService.crearFacturaFleteConsolidada({ ...headersParams, ...dtoIn });
    }

    @Post('anularFleteConsolidado')
    @Auth()
    @ApiOperation({ summary: 'Anula la factura consolidada, su pago (si existe) y desvincula los envíos' })
    anularFleteConsolidado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: IdFleteConsolidadoDto,
    ) {
        return this.saveService.anularFleteConsolidado(dtoIn.ide_cpcfc, headersParams);
    }

    @Post('marcarFleteConsolidadoPagado')
    @Auth()
    @ApiOperation({ summary: 'Marca la tabla de control como pagada tras registrar el pago de la factura consolidada' })
    marcarFleteConsolidadoPagado(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: MarcarPagadoFleteConsolidadoDto,
    ) {
        return this.saveService.marcarFleteConsolidadoPagado({ ...headersParams, ...dtoIn });
    }

    @Get('getFletesConsolidados')
    @Auth()
    @ApiOperation({ summary: 'Lista (tabla de control) de los procesos de factura consolidada de flete' })
    getFletesConsolidados(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetFletesConsolidadosDto,
    ) {
        return this.service.getFletesConsolidados({ ...headersParams, ...dtoIn });
    }

    @Get('getFleteConsolidadoById/:ideCpcfc')
    @Auth()
    @ApiOperation({ summary: 'Detalle de un proceso de factura consolidada de flete (para Editar/Ver)' })
    getFleteConsolidadoById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideCpcfc') ideCpcfc: string,
    ) {
        return this.service.getFleteConsolidadoById(Number(ideCpcfc), headersParams);
    }
}
