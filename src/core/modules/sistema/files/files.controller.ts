import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  Body,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { diskStorage, memoryStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ALLOWED_IMAGE_MIMES, FILE_STORAGE_CONSTANTS } from './constants/files.constants';
import { CheckExistFileDto } from './dto/check-exist-file.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { DeleteFilesDto } from './dto/delete-files.dto';
import { FavoriteFileDto } from './dto/favorite-file.dto';
import { GetFilesDto } from './dto/get-files.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { fileNamer } from './helpers';
import { fileOriginalNamer } from './helpers/fileNamer.helper';


@ApiTags('Sistema-Files')
@Controller('sistema/files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly configService: ConfigService
  ) { }

  @Get('image/tesoreria/:imageName')
  @ApiOperation({ summary: 'Servir imagen estática de tesorería' })
  getTesoreriaImage(@Res() res: Response, @Param('imageName') imageName: string) {
    const path = this.filesService.getStaticImage(`tesoreria/${imageName}`);
    res.sendFile(path);
  }

  @Get('image/:imageName')
  @ApiOperation({ summary: 'Servir imagen estática. Soporta ?w=N (resize) y ?webp=1 (conversión)' })
  async getStaticImage(
    @Res() res: Response,
    @Param('imageName') imageName: string,
    @Query('w') width?: string,
    @Query('webp') toWebp?: string,
  ) {
    const imagePath = this.filesService.getStaticImage(imageName);
    // UUID en el nombre → contenido inmutable → cachear 1 año en browser y CDN
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const w = width ? parseInt(width, 10) : undefined;
    const convertWebp = toWebp === '1';

    // Sin transformación → sendFile directo (nginx lo interceptará antes)
    if (!w && !convertWebp) {
      return res.sendFile(imagePath);
    }

    // Con transformación → Sharp procesa y responde en memoria
    return this.filesService.serveOptimizedImage(imagePath, res, { width: w, toWebp: convertWebp });
  }

  @Post('deleteFile/:fileName')
  @ApiOperation({ summary: 'Eliminar archivo estático por nombre' })
  deleteStaticFile(@Param('fileName') fileName: string) {
    return this.filesService.deleteStaticFile(fileName);
  }

  @Post('uploadStaticImage')
  @ApiOperation({ summary: 'Subir imagen estática (máx 15 MB). Sharp la optimiza automáticamente al subir.' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: FILE_STORAGE_CONSTANTS.IMAGE_MAX_SIZE, // 15 MB
      },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype as any)) {
          return cb(new BadRequestException(
            `Tipo de archivo no permitido: ${file.mimetype}. Use: ${ALLOWED_IMAGE_MIMES.join(', ')}`
          ), false);
        }
        cb(null, true);
      },
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, FILE_STORAGE_CONSTANTS.BASE_PATH),
        filename: fileNamer,
      }),
    }),
  )
  async uploadStaticImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo de imagen');
    }
    // Sharp: optimiza la imagen recién subida (escala si es muy grande, sin reemplazar el original)
    await this.filesService.optimizeUploadedImage(file.path);

    const secureUrl = `${this.configService.get('HOST_API')}/api/sistema/files/image/${file.filename}`;
    return {
      filename: file.filename,
      url: secureUrl,
    };
  }
  //--------------

  @Get('getFiles')
  @ApiOperation({ summary: 'Listar archivos de una carpeta del sistema de gestión documental' })
  //@Auth()
  getFiles(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetFilesDto) {
    return this.filesService.getFiles({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('createFolder')
  @ApiOperation({ summary: 'Crear carpeta en el sistema de gestión documental' })
  //@Auth()
  createFolder(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CreateFolderDto) {
    return this.filesService.createFolder({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('uploadOriginalFile')
  @ApiOperation({ summary: 'Subir archivo conservando el nombre original (límite 500MB)' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB en bytes
      },
      storage: diskStorage({
        destination: (req, file, cb) => {
          const folderPath = FILE_STORAGE_CONSTANTS.BASE_PATH
          cb(null, folderPath);
        },
        filename: fileOriginalNamer,
      }),
    }),
  )
  uploadOriginalFile(@UploadedFile() file: Express.Multer.File, @Body() dtoIn: UploadFileDto) {
    return this.filesService.uploadOriginalFile(file);
  }

  @Post('uploadFile')
  @ApiOperation({ summary: 'Subir archivo al sistema de gestión documental (límite 500MB)' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB en bytes
      },
      storage: diskStorage({
        destination: (req, file, cb) => {
          const folderPath = FILE_STORAGE_CONSTANTS.BASE_PATH
          cb(null, folderPath);
        },
        filename: fileNamer,
      }),
    }),
  )
  uploadFile(
    @AppHeaders() headersParams: HeaderParamsDto,
    @UploadedFile() file: Express.Multer.File,
    @Body() dtoIn: UploadFileDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded or file is too large');
    }
    return this.filesService.uploadFile(
      {
        ...headersParams,
        ...dtoIn,
      },
      file,
    );
  }

  @Post('deleteFiles')
  @ApiOperation({ summary: 'Eliminar archivos del sistema de gestión documental' })
  //@Auth()
  deleteFiles(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: DeleteFilesDto) {
    return this.filesService.deleteFiles({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('downloadFile/:uuid')
  @ApiOperation({ summary: 'Descargar archivo por UUID' })
  downloadFile(@Res() res: Response, @Param('uuid') uuid: string) {
    return this.filesService.downloadFile(uuid, res);
  }

  @Post('checkExistFile')
  @ApiOperation({ summary: 'Verificar si existe un archivo por ruta' })
  //@Auth()
  checkExistFile(@Body() dtoIn: CheckExistFileDto) {
    return this.filesService.checkExistFile(dtoIn);
  }

  @Post('renameFile')
  @ApiOperation({ summary: 'Renombrar un archivo' })
  //@Auth()
  renameFile(@Body() dtoIn: RenameFileDto) {
    return this.filesService.renameFile(dtoIn);
  }

  @Post('favoriteFile')
  @ApiOperation({ summary: 'Marcar o desmarcar un archivo como favorito' })
  //@Auth()
  favoriteFile(@Body() dtoIn: FavoriteFileDto) {
    return this.filesService.favoriteFile(dtoIn);
  }

  @Put('move')
  @ApiOperation({ summary: 'Mover archivo o carpeta a una nueva ubicación' })
  moveItem(@Body('sourcePath') sourcePath: string, @Body('destinationPath') destinationPath: string) {
    return this.filesService.moveItem(sourcePath, destinationPath);
  }

  // Temporales

  @Post('uploadTmpFile')
  @ApiOperation({ summary: 'Subir archivo temporal en memoria (sin persistencia)' })
  // @Auth()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // Usa memoryStorage importado directamente
      limits: {
        fileSize: FILE_STORAGE_CONSTANTS.MAX_FILE_SIZE,
        files: 1,
      },
    }),
  )
  uploadMedia(@AppHeaders() _headersParams: HeaderParamsDto, @UploadedFile() file: Express.Multer.File) {
    return this.filesService.uploadTmpFile(file);
  }

  @Get('downloadTmpFile/:fileName')
  @ApiOperation({ summary: 'Descargar archivo temporal por nombre' })
  downloadTmpFile(@Res() res: Response, @Param('fileName') fileName: string) {
    return this.filesService.downloadTmpFile(fileName, res);
  }

  @Get('imageTmp/:imageName')
  @ApiOperation({ summary: 'Servir imagen temporal por nombre' })
  getStaticImageTmp(@Res() res: Response, @Param('imageName') imageName: string) {
    const path = this.filesService.getStaticTmpImage(imageName);
    res.sendFile(path);
  }



}
