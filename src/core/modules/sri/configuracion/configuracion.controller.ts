import fs from 'node:fs';
import path from 'node:path';

import {
    Body,
    Controller,
    Get,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { v4 as uuid } from 'uuid';

import { ConfiguracionSaveService } from './configuracion-save.service';
import { ConfiguracionService } from './configuracion.service';
import { SaveEmisorDto } from './dto/save-emisor.dto';
import { SaveFirmaDto } from './dto/save-firma.dto';
import { ValidateFirmaDto } from './dto/validate-firma.dto';

const FIRMAS_DIR = path.join(envs.pathDrive, 'sri', 'firmas');
fs.mkdirSync(FIRMAS_DIR, { recursive: true });

@ApiTags('SRI-Configuracion')
@Controller('sri/configuracion')
export class ConfiguracionController {
    constructor(
        private readonly service: ConfiguracionService,
        private readonly saveService: ConfiguracionSaveService,
    ) { }

    @Get('getEmisor')
    @ApiOperation({ summary: 'Obtener configuración del emisor SRI por empresa/sucursal' })
    getEmisor(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getEmisor(h);
    }

    @Get('getFirma')
    @ApiOperation({ summary: 'Obtener la firma digital activa por empresa/sucursal' })
    getFirma(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getFirma(h);
    }

    @Post('saveEmisor')
    @ApiOperation({ summary: 'Crear o actualizar configuración de emisor SRI' })
    saveEmisor(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveEmisorDto,
    ) {
        return this.saveService.saveEmisor({ ...h, ...dto });
    }

    @Post('saveFirma')
    @ApiOperation({ summary: 'Guardar metadata de firma digital (contraseña, representante, etc.)' })
    saveFirma(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveFirmaDto,
    ) {
        return this.saveService.saveFirma({ ...h, ...dto });
    }

    @Post('uploadFirma')
    @ApiOperation({ summary: 'Subir archivo .p12 de firma digital' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary', description: 'Archivo .p12 de firma electrónica' },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, FIRMAS_DIR),
            filename: (_req, file, cb) => {
                const ext = path.extname(file.originalname).toLowerCase() || '.p12';
                cb(null, `${uuid()}${ext}`);
            },
        }),
        fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext !== '.p12' && ext !== '.pfx') {
                cb(new Error('Solo se permiten archivos .p12 o .pfx'), false);
                return;
            }
            cb(null, true);
        },
    }))
    async uploadFirma(
        @AppHeaders() h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.saveService.uploadFirma(file, h);
    }

    @Post('validateFirma')
    @ApiOperation({ summary: 'Validar contraseña de la firma digital contra el archivo .p12' })
    validateFirma(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: ValidateFirmaDto,
    ) {
        return this.saveService.validateFirma({ ...h, ...dto });
    }
}
