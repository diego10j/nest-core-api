import fs from 'node:fs';
import path from 'node:path';

import {
    Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { v4 as uuid } from 'uuid';

import { CajasSaveService } from './cajas-save.service';
import { CajasService } from './cajas.service';
import { GetCajasDto } from './dto/get-cajas.dto';
import { SaveCajaDto } from './dto/save-caja.dto';

const CAJAS_DIR = path.join(envs.pathDrive, 'tesoreria');
fs.mkdirSync(CAJAS_DIR, { recursive: true });

@ApiTags('Tesoreria - Cajas')
@Controller('tesoreria/cajas')
export class CajasController {
    constructor(
        private readonly service: CajasService,
        private readonly saveService: CajasSaveService,
    ) { }

    @Get('getCajas')
    @ApiOperation({ summary: 'Listar cajas con paginación y filtros' })
    getCajas(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dto: GetCajasDto,
    ) {
        return this.service.getCajas({ ...h, ...dto });
    }

    @Get('getListDataCajas')
    @ApiOperation({ summary: 'Listar cajas para combos' })
    getListDataCajas(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataCajas(h);
    }

    @Get('getCajaById/:ideTeban')
    @ApiOperation({ summary: 'Obtener caja por ID' })
    getCajaById(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ideTeban', ParseIntPipe) ideTeban: number,
    ) {
        return this.service.getCajaById(ideTeban);
    }

    @Post('saveCaja')
    @ApiOperation({ summary: 'Crear o actualizar una caja' })
    saveCaja(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveCajaDto,
    ) {
        return this.saveService.saveCaja({ ...h, ...dto });
    }

    @Post('uploadFotoCaja/:ideTeban')
    @ApiOperation({ summary: 'Subir foto de la caja' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Foto de la caja (PNG, JPG, JPEG)',
                },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, CAJAS_DIR),
            filename: (_req, file, cb) => {
                const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                cb(null, `${uuid()}.${ext}`);
            },
        }),
    }))
    async uploadFotoCaja(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideTeban', ParseIntPipe) ideTeban: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.saveService.updateFotoCaja(ideTeban, file.filename, h);
    }

    @Get('downloadFotoCaja/:fileName')
    @ApiOperation({ summary: 'Descargar foto de la caja' })
    downloadFotoCaja(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('fileName') fileName: string,
        @Res() res: any,
    ) {
        const filePath = path.join(CAJAS_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Imagen no encontrada');
        }
        res.sendFile(filePath);
    }
}
