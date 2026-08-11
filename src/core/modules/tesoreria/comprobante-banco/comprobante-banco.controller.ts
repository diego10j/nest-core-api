import fs from 'node:fs';

import {
    Body, Controller, Delete, Get, Param, ParseIntPipe, Post,
    Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Public } from 'src/core/auth/decorators/public.decorator';
import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/constants/files.constants';
import { FilesService } from 'src/core/modules/sistema/files/files.service';
import { getStaticImage } from 'src/util/helpers/file-utils';
import { v4 as uuid } from 'uuid';

import { ComprobanteBancoSaveService } from './comprobante-banco-save.service';
import { ComprobanteBancoService } from './comprobante-banco.service';
import { GetComprobantesBancoDto } from './dto/get-comprobantes-banco.dto';
import { SaveComprobanteBancoDto } from './dto/save-comprobante-banco.dto';
import { SetActivoDto } from './dto/set-activo.dto';

/**
 * Fotos de comprobantes de cobro/pago (tes_info_comprobante_banco.foto_teincb): tanto el
 * upload como el download leen/escriben en FILE_STORAGE_CONSTANTS.TEMP_DIR (temp_media),
 * la misma carpeta que usa el resto del manejo de archivos de la app - decisión explícita
 * para manejar todos los archivos de forma unificada en ese path.
 */
fs.mkdirSync(FILE_STORAGE_CONSTANTS.TEMP_DIR, { recursive: true });

@ApiTags('Tesoreria - Comprobantes Banco')
@Controller('tesoreria/comprobante-banco')
export class ComprobanteBancoController {
    constructor(
        private readonly service: ComprobanteBancoService,
        private readonly saveService: ComprobanteBancoSaveService,
        private readonly filesService: FilesService,
    ) { }

    @Post('uploadComprobante')
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Subir la foto de un comprobante de cobro/pago (temp_media)' })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, FILE_STORAGE_CONSTANTS.TEMP_DIR),
            filename: (_req, file, cb) => {
                const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                cb(null, `${uuid()}.${ext}`);
            },
        }),
    }))
    uploadComprobante(
        @AppHeaders() _h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return { message: 'ok', fileName: file.filename };
    }

    @Public()
    @Get('downloadComprobante/:fileName')
    @ApiOperation({ summary: 'Descargar la foto de un comprobante de cobro/pago (público). Soporta ?w=N para thumbnail' })
    async downloadComprobante(
        @Param('fileName') fileName: string,
        @Res() res: any,
        @Query('w') width?: string,
    ) {
        // getStaticImage busca en temp_media (isTmp=true) y, si el archivo no existe, cae a
        // no-image.png en vez de fallar - evita que el frontend reciba un 404 cuando el
        // comprobante fue borrado o nunca se subió.
        const filePath = getStaticImage(fileName, true);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const w = width ? parseInt(width, 10) : undefined;
        if (!w) {
            res.sendFile(filePath);
            return;
        }
        return this.filesService.serveOptimizedImage(filePath, res, { width: w });
    }

    @Get('getComprobantes')
    @ApiOperation({ summary: 'Listar comprobantes de banco con paginación y filtros' })
    getComprobantes(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dto: GetComprobantesBancoDto,
    ) {
        return this.service.getComprobantes({ ...h, ...dto });
    }

    @Get('getComprobanteById/:ideTeincb')
    @ApiOperation({ summary: 'Obtener comprobante de banco por ID' })
    getComprobanteById(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ideTeincb', ParseIntPipe) ideTeincb: number,
    ) {
        return this.service.getComprobanteById(ideTeincb);
    }

    @Get('getComprobantesByBanco/:ideTeclb')
    @ApiOperation({ summary: 'Listar comprobantes por libro banco con paginación y filtros' })
    getComprobantesByBanco(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideTeclb', ParseIntPipe) ideTeclb: number,
        @Query() dto: GetComprobantesBancoDto,
    ) {
        return this.service.getComprobantesByBanco(ideTeclb, { ...h, ...dto });
    }

    @Post('saveComprobante')
    @ApiOperation({ summary: 'Crear o actualizar un comprobante de banco' })
    saveComprobante(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveComprobanteBancoDto,
    ) {
        return this.saveService.saveComprobante({ ...h, ...dto });
    }

    @Post('setActivoComprobante')
    @ApiOperation({ summary: 'Activar o desactivar un comprobante de banco' })
    setActivoComprobante(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SetActivoDto,
    ) {
        return this.saveService.setActivoComprobante({ ...h, ...dto });
    }

    @Delete('deleteComprobante/:ideTeincb')
    @ApiOperation({ summary: 'Eliminar un comprobante de banco' })
    deleteComprobante(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideTeincb', ParseIntPipe) ideTeincb: number,
    ) {
        return this.saveService.deleteComprobante(ideTeincb, h);
    }
}
