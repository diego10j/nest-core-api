import {
    Controller,
    Get,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { TesoreriaLdService } from './tesoreria-ld.service';
import { TesoreriaService } from './tesoreria.service';

@ApiTags('Tesoreria')
@Controller('tesoreria')
export class TesoreriaController {
    constructor(
        private readonly service: TesoreriaService,
        private readonly serviceLd: TesoreriaLdService,
    ) { }

    // ─── CUENTAS BANCARIAS ────────────────────────────────────────────────────

    @Get('getCuentasBancoPagos')
    @ApiOperation({ summary: 'Listar cuentas bancarias habilitadas para pagos' })
    getCuentasBancoPagos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBancoPagos(headersParams);
    }

    @Get('getCuentasBanco')
    @ApiOperation({ summary: 'Listar todas las cuentas bancarias de la empresa' })
    getCuentasBanco(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBanco(headersParams);
    }

    @Get('getCuentasBancoCheques')
    @ApiOperation({ summary: 'Listar cuentas bancarias habilitadas para emisión de cheques' })
    getCuentasBancoCheques(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBancoCheques(headersParams);
    }

    @Get('getCuentasCaja')
    @ApiOperation({ summary: 'Listar cuentas de caja' })
    getCuentasCaja(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasCaja(headersParams);
    }

    @Get('getCuentasCajaCheques')
    @ApiOperation({ summary: 'Listar cuentas de caja habilitadas para emisión de cheques' })
    getCuentasCajaCheques(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasCajaCheques(headersParams);
    }

    // ─── TIPOS DE TRANSACCIÓN BANCARIA ────────────────────────────────────────

    @Get('getListDataTiposTranBanc')
    @ApiOperation({ summary: 'Listar todos los tipos de transacción bancaria' })
    getListDataTiposTranBanc(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBanc(headersParams);
    }

    @Get('getListDataTiposTranBancIngreso')
    @ApiOperation({ summary: 'Listar tipos de transacción bancaria de ingreso' })
    getListDataTiposTranBancIngreso(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBancIngreso(headersParams);
    }

    @Get('getListDataTiposTranBancEgreso')
    @ApiOperation({ summary: 'Listar tipos de transacción bancaria de egreso' })
    getListDataTiposTranBancEgreso(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBancEgreso(headersParams);
    }

    @Post('procesarImagenTransferencia')
    @ApiOperation({ summary: 'Procesa imagen de comprobante de transferencia bancaria (OCR con fallback a GPT-4o Vision)' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Imagen del comprobante de transferencia (PNG, JPG, JPEG)',
                },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file'))
    async procesarImagenTransferencia(
        @AppHeaders() headersParams: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.service.procesarImagenTransferencia(file.buffer, file.originalname, file.mimetype);
    }

    @Post('procesarImagenTransferenciaGpt')
    @ApiOperation({ summary: 'Procesa imagen directamente con GPT-4o Vision (sin OCR). Más preciso.' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Imagen del comprobante de transferencia (PNG, JPG, JPEG)',
                },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file'))
    async procesarImagenTransferenciaGpt(
        @AppHeaders() headersParams: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.service.procesarImagenTransferenciaVision(file.buffer, file.mimetype);
    }
}
