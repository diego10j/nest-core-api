import fs from 'node:fs';
import path from 'node:path';

import {
    Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { envs } from 'src/config/envs';
import { Public } from 'src/core/auth/decorators/public.decorator';
import { v4 as uuid } from 'uuid';

import { CatalogosSaveService } from './catalogos-save.service';
import { CatalogosService } from './catalogos.service';
import { GetCatalogoByPathDto } from './dto/get-catalogo-by-path.dto';
import { GetCatalogosDto } from './dto/get-catalogos.dto';
import { IdCatalogoDto } from './dto/id-catalogo.dto';
import { IdDetCatalogoDto } from './dto/id-det-catalogo.dto';
import { SaveCatalogoDto } from './dto/save-catalogo.dto';
import { SetActivoCatalogoDto } from './dto/set-activo-catalogo.dto';

const CATALOGOS_DIR = path.join(envs.pathDrive, 'inventario', 'catalogos');
fs.mkdirSync(CATALOGOS_DIR, { recursive: true });

@ApiTags('Inventario-Catalogos')
@Controller('inventario/catalogos')
export class CatalogosController {
    constructor(
        private readonly service: CatalogosService,
        private readonly saveService: CatalogosSaveService,
    ) { }

    // ─── CONSULTAS ────────────────────────────────────────────────────────────

    @Get('getCatalogos')
    @ApiOperation({ summary: 'Listar catálogos con paginación y filtros' })
    getCatalogos(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dtoIn: GetCatalogosDto,
    ) {
        return this.service.getCatalogos({ ...h, ...dtoIn });
    }

    @Public()
    @Get('getListaCatalogos')
    @ApiOperation({ summary: 'Listar catálogos activos para frontend (público, estructura plana)' })
    getListaCatalogos(
        @Query() dtoIn: GetCatalogosDto,
    ) {
        return this.service.getListaCatalogos(dtoIn);
    }

    @Public()
    @Get('getCatalogoByPath')
    @ApiOperation({ summary: 'Obtener catálogo completo por path (público, incluye detalles con precios)' })
    getCatalogoByPath(
        @AppHeaders() _h: HeaderParamsDto,
        @Query() dtoIn: GetCatalogoByPathDto,
    ) {
        return this.service.getCatalogoByPath(dtoIn);
    }

    @Get('getCatalogoByPathAuth')
    @ApiOperation({ summary: 'Obtener catálogo completo por path (autenticado, admin)' })
    getCatalogoByPathAuth(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dtoIn: GetCatalogoByPathDto,
    ) {
        return this.service.getCatalogoByPathAuth({ ...h, ...dtoIn });
    }

    @Get('getCatalogoById/:ideInccat')
    @ApiOperation({ summary: 'Obtener cabecera de catálogo por ID' })
    getCatalogoById(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideInccat', ParseIntPipe) ideInccat: number,
    ) {
        return this.service.getCatalogoById({ ...h, ide_inccat: ideInccat } as IdCatalogoDto & HeaderParamsDto);
    }

    @Get('getDetallesByCatalogo/:ideInccat')
    @ApiOperation({ summary: 'Listar detalles (productos) de un catálogo' })
    getDetallesByCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideInccat', ParseIntPipe) ideInccat: number,
    ) {
        return this.service.getDetallesByCatalogo({ ...h, ide_inccat: ideInccat } as IdCatalogoDto & HeaderParamsDto);
    }

    @Get('getCatalogoCompleto/:ideInccat')
    @ApiOperation({ summary: 'Obtener catálogo completo (cabecera + detalles)' })
    getCatalogoCompleto(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideInccat', ParseIntPipe) ideInccat: number,
    ) {
        return this.service.getCatalogoCompleto({ ...h, ide_inccat: ideInccat } as IdCatalogoDto & HeaderParamsDto);
    }

    // ─── SAVE ─────────────────────────────────────────────────────────────────

    @Post('saveCatalogo')
    @ApiOperation({ summary: 'Crear o actualizar un catálogo (cabecera + detalles)' })
    saveCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: SaveCatalogoDto,
    ) {
        return this.saveService.saveCatalogo({ ...h, ...dtoIn });
    }

    @Post('deleteCatalogo')
    @ApiOperation({ summary: 'Eliminar un catálogo y todos sus detalles' })
    deleteCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: IdCatalogoDto,
    ) {
        return this.saveService.deleteCatalogo({ ...h, ...dtoIn });
    }

    @Post('deleteDetalleCatalogo')
    @ApiOperation({ summary: 'Eliminar un detalle de catálogo' })
    deleteDetalleCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: IdDetCatalogoDto,
    ) {
        return this.saveService.deleteDetalleCatalogo({ ...h, ...dtoIn });
    }

    @Post('setActivoCatalogo')
    @ApiOperation({ summary: 'Activar o desactivar un catálogo' })
    setActivoCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: SetActivoCatalogoDto,
    ) {
        return this.saveService.setActivoCatalogo({ ...h, ...dtoIn });
    }

    @Post('setActivoDetalleCatalogo')
    @ApiOperation({ summary: 'Activar o desactivar un detalle de catálogo' })
    setActivoDetalleCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: SetActivoCatalogoDto,
    ) {
        return this.saveService.setActivoDetalleCatalogo({ ...h, ...dtoIn });
    }

    // ─── UPLOAD IMÁGENES ──────────────────────────────────────────────────────

    @Post('uploadImagenCatalogo/:ideInccat')
    @ApiOperation({ summary: 'Subir imagen principal del catálogo' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Imagen principal del catálogo (PNG, JPG, JPEG, WebP)',
                },
            },
            required: ['file'],
        },
    })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, CATALOGOS_DIR),
            filename: (_req, file, cb) => {
                const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                cb(null, `${uuid()}.${ext}`);
            },
        }),
    }))
    async uploadImagenCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideInccat', ParseIntPipe) ideInccat: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.saveService.updateImagenCatalogo(ideInccat, file.filename, h);
    }

    @Post('uploadImagenesCatalogo/:ideInccat')
    @ApiOperation({ summary: 'Subir múltiples imágenes adicionales del catálogo' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    description: 'Imágenes adicionales del catálogo (PNG, JPG, JPEG, WebP)',
                },
            },
            required: ['files'],
        },
    })
    @UseInterceptors(FilesInterceptor('files', 20, {
        storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, CATALOGOS_DIR),
            filename: (_req, file, cb) => {
                const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
                cb(null, `${uuid()}.${ext}`);
            },
        }),
    }))
    async uploadImagenesCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideInccat', ParseIntPipe) ideInccat: number,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        const fileNames = files.map((f) => f.filename);
        return this.saveService.appendImagenesCatalogo(ideInccat, fileNames, h);
    }

    // ─── DOWNLOAD IMÁGENES ────────────────────────────────────────────────────

    @Public()
    @Get('downloadImagenCatalogo/:fileName')
    @ApiOperation({ summary: 'Descargar imagen de catálogo (público)' })
    downloadImagenCatalogo(
        @Param('fileName') fileName: string,
        @Res() res: any,
    ) {
        const filePath = path.join(CATALOGOS_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Imagen no encontrada');
        }
        res.sendFile(filePath);
    }

    @Post('removeImagenCatalogo/:ideInccat')
    @ApiOperation({ summary: 'Eliminar una imagen del array de imágenes del catálogo' })
    removeImagenCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideInccat', ParseIntPipe) ideInccat: number,
        @Body('fileName') fileName: string,
    ) {
        return this.saveService.removeImagenCatalogo(ideInccat, fileName, h);
    }

    // ─── TIPO CATÁLOGO ───────────────────────────────────────────────────────

    @Get('getListDataTipoCatalogo')
    @ApiOperation({ summary: 'Listar tipos de catálogo activos para combos' })
    getListDataTipoCatalogo(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataTipoCatalogo(h);
    }

    @Get('getTableQueryTipoCatalogo')
    @ApiOperation({ summary: 'Tabla de tipos de catálogo para administración' })
    getTableQueryTipoCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dto: QueryOptionsDto,
    ) {
        return this.service.getTableQueryTipoCatalogo({ ...h, ...dto });
    }

    @Post('setActivoTipoCatalogo')
    @ApiOperation({ summary: 'Activar o desactivar un tipo de catálogo' })
    setActivoTipoCatalogo(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SetActivoCatalogoDto,
    ) {
        return this.saveService.setActivoTipoCatalogo({ ...h, ...dto });
    }
}
