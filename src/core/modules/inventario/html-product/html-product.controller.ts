import fs from 'node:fs';
import path from 'node:path';

import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Public } from 'src/core/auth/decorators/public.decorator';
import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/constants/files.constants';

import { ExtractProductHtmlDto } from './dto/extract-product-html.dto';
import { ProcessImageDto } from './dto/process-image.dto';
import { HtmlProductService } from './html-product.service';

@ApiTags('Inventario-HTML-Product')
@Controller('inventario/html-product')
export class HtmlProductController {
    constructor(private readonly service: HtmlProductService) { }

    @Post('extract')
    @ApiOperation({ summary: 'Extrae datos de producto desde HTML: imágenes, título, descripciones normalizadas con IA' })
    extract(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: ExtractProductHtmlDto,
    ) {
        return this.service.extractFromHtml(dto.html, h.ideEmpr, dto.url, dto.ideInarti);
    }

    @Post('processImage')
    @ApiOperation({ summary: 'Aplica watermark a una imagen de producto existente (logo, átomos, footer, marca centro)' })
    processImage(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: ProcessImageDto,
    ) {
        return this.service.processImage(dto.fileName, h.ideEmpr);
    }

    @Post('processImagePortada')
    @ApiOperation({ summary: 'Quita fondo de imagen, aplica gradiente + átomos + watermark completo' })
    processImagePortada(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: ProcessImageDto,
    ) {
        return this.service.processImagePortada(dto.fileName, h.ideEmpr);
    }

    @Post('acceptImage')
    @ApiOperation({ summary: 'Reemplaza la imagen original con la versión procesada en temp' })
    acceptImage(
        @Body() dto: ProcessImageDto,
    ) {
        return this.service.acceptImage(dto.fileName);
    }

    @Public()
    @Get('downloadImagen/:fileName')
    @ApiOperation({ summary: 'Descargar imagen procesada (temporal)' })
    downloadImagen(
        @Param('fileName') fileName: string,
        @Res() res: Response,
    ) {
        const filePath = path.join(FILE_STORAGE_CONSTANTS.TEMP_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Imagen no encontrada');
        }
        res.sendFile(filePath);
    }
}
