import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { BaseConocimientoService } from './base-conocimiento.service';
import { CONOCIMIENTO_STORAGE } from './constants/base-conocimiento.constants';
import { ArticuloUuidDto } from './dto/articulo-uuid.dto';
import { GetArchivosDto } from './dto/get-archivos.dto';
import { GetArticulosDto } from './dto/get-articulos.dto';
import { SaveArticuloDto } from './dto/save-articulo.dto';
import { UploadArchivoDto } from './dto/upload-archivo.dto';
import { conocimientoFileNamer } from './helpers/conocimiento-file.helper';

@ApiTags('Sistema-BaseConocimiento')
@Controller('sistema/base-conocimiento')
export class BaseConocimientoController {
  constructor(private readonly service: BaseConocimientoService) {}

  @Get('getArticulos')
  @ApiOperation({ summary: 'Listar/buscar artículos de la base de conocimiento' })
  getArticulos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetArticulosDto) {
    return this.service.getArticulos({ ...headersParams, ...dtoIn });
  }

  @Get('getArticulo')
  @ApiOperation({ summary: 'Obtener un artículo por uuid' })
  getArticulo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ArticuloUuidDto) {
    return this.service.getArticulo({ ...headersParams, ...dtoIn });
  }

  @Post('saveArticulo')
  @ApiOperation({ summary: 'Crear o actualizar un artículo (incluye tags y relaciones)' })
  saveArticulo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveArticuloDto) {
    return this.service.saveArticulo({ ...headersParams, ...dtoIn });
  }

  @Post('deleteArticulo')
  @ApiOperation({ summary: 'Archivar (eliminar) un artículo' })
  deleteArticulo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArticuloUuidDto) {
    return this.service.deleteArticulo({ ...headersParams, ...dtoIn });
  }

  @Post('registrarVista')
  @ApiOperation({ summary: 'Registrar una vista de un artículo' })
  registrarVista(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArticuloUuidDto) {
    return this.service.registrarVista({ ...headersParams, ...dtoIn });
  }

  @Get('getCategorias')
  @ApiOperation({ summary: 'Listar categorías existentes (para autocomplete)' })
  getCategorias(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getCategorias(headersParams);
  }

  @Get('getTags')
  @ApiOperation({ summary: 'Listar tags existentes (para autocomplete)' })
  getTags(@AppHeaders() headersParams: HeaderParamsDto, @Query('value') value?: string) {
    return this.service.getTags({ ...headersParams, value });
  }

  // ------------------------------------------------------- Adjuntos propios (no sis_archivo)

  @Post('uploadArchivo')
  @ApiOperation({ summary: 'Subir un adjunto de un artículo (máx 25MB, almacenamiento propio)' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CONOCIMIENTO_STORAGE.MAX_FILE_SIZE },
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, CONOCIMIENTO_STORAGE.BASE_PATH),
        filename: conocimientoFileNamer,
      }),
    }),
  )
  uploadArchivo(
    @AppHeaders() headersParams: HeaderParamsDto,
    @UploadedFile() file: Express.Multer.File,
    @Body() dtoIn: UploadArchivoDto,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    return this.service.uploadArchivo(Number(dtoIn.ideCono), file, headersParams);
  }

  @Get('getArchivos')
  @ApiOperation({ summary: 'Listar adjuntos de un artículo' })
  getArchivos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetArchivosDto) {
    return this.service.getArchivos({ ...headersParams, ...dtoIn });
  }

  @Get('downloadArchivo/:uuid')
  @ApiOperation({ summary: 'Descargar/servir un adjunto por uuid' })
  downloadArchivo(@Res() res: Response, @Param('uuid') uuid: string) {
    return this.service.downloadArchivo(uuid, res);
  }

  @Post('deleteArchivo')
  @ApiOperation({ summary: 'Eliminar un adjunto' })
  deleteArchivo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArticuloUuidDto) {
    return this.service.deleteArchivo({ ...headersParams, ...dtoIn });
  }
}
