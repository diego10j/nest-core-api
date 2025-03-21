import { Controller, Get, Post, Param, UploadedFile, UseInterceptors, BadRequestException, Res, Body, Delete, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { FilesService } from './files.service';

import { fileNamer } from './helpers';
import { GetFilesDto } from './dto/get-files.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { fileOriginalNamer, PATH_DRIVE } from './helpers/fileNamer.helper';
import { UploadFileDto } from './dto/upload-file.dto';
import { DeleteFilesDto } from './dto/delete-files.dto';
import { CheckExistFileDto } from './dto/check-exist-file.dto';
import { RenameFileDto } from './dto/rename-file.dto';
import { FavoriteFileDto } from './dto/favorite-file.dto';



@Controller('sistema/files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
  ) { }

  @Get('image/:imageName')
  getStaticImage(
    @Res() res: Response,
    @Param('imageName') imageName: string
  ) {

    const path = this.filesService.getStaticImage(imageName);

    res.sendFile(path);
  }


  @Post('deleteFile/:fileName')
  deleteStaticFile(
    @Param('fileName') fileName: string
  ) {
    return this.filesService.deleteStaticFile(fileName);
  }

  @Post('image')
  @UseInterceptors(FileInterceptor('file', {
    // limits: { fileSize: 1000 }
    storage: diskStorage({
      destination: (req, file, cb) => {
        const folderPath = PATH_DRIVE();
        cb(null, folderPath);
      },
      filename: fileNamer
    })
  }))
  uploadStaticImage(
    @UploadedFile() file: Express.Multer.File,
  ) {

    if (!file) {
      throw new BadRequestException('Make sure that the file is an image');
    }

    // const secureUrl = `${ file.filename }`;
    const secureUrl = `${this.configService.get('HOST_API')}/api/files/image/${file.filename}`;

    return {
      filename: file.filename,
      url: secureUrl
    };
  }
  //--------------

  @Post('getFiles')
  //@Auth()
  getFiles(
    @Body() dtoIn: GetFilesDto
  ) {
    return this.filesService.getFiles(dtoIn);
  }


  @Post('createFolder')
  //@Auth()
  createFolder(
    @Body() dtoIn: CreateFolderDto
  ) {
    return this.filesService.createFolder(dtoIn);
  }


  @Post('uploadOriginalFile')
  @UseInterceptors(FileInterceptor('file', {
    // limits: { fileSize: 1000 }
    storage: diskStorage({
      destination: (req, file, cb) => {
        const folderPath = PATH_DRIVE();
        cb(null, folderPath);
      },
      filename: fileOriginalNamer
    })
  }))
  uploadOriginalFile(@UploadedFile() file: Express.Multer.File,
    @Body() dtoIn: UploadFileDto) {
    return this.filesService.uploadOriginalFile(file);
  }


  @Post('uploadFile')
  @UseInterceptors(FileInterceptor('file', {
    // limits: { fileSize: 1000 }
    storage: diskStorage({
      destination: (req, file, cb) => {
        const folderPath = PATH_DRIVE();
        cb(null, folderPath);
      },
      filename: fileNamer
    })
  }))
  uploadFile(@UploadedFile() file: Express.Multer.File,
    @Body() dtoIn: UploadFileDto) {
    return this.filesService.uploadFile(dtoIn, file);
  }

  @Post('deleteFiles')
  //@Auth()
  deleteFiles(
    @Body() dtoIn: DeleteFilesDto
  ) {
    return this.filesService.deleteFiles(dtoIn);
  }

  @Get('downloadFile/:uuid')
  downloadFile(
    @Res() res: Response,
    @Param('uuid') uuid: string
  ) {

    return this.filesService.downloadFile(uuid, res);
  }

  @Post('checkExistFile')
  //@Auth()
  checkExistFile(
    @Body() dtoIn: CheckExistFileDto
  ) {
    return this.filesService.checkExistFile(dtoIn);
  }


  @Post('renameFile')
  //@Auth()
  renameFile(
    @Body() dtoIn: RenameFileDto
  ) {
    return this.filesService.renameFile(dtoIn);
  }

  @Post('favoriteFile')
  //@Auth()
  favoriteFile(
    @Body() dtoIn: FavoriteFileDto
  ) {
    return this.filesService.favoriteFile(dtoIn);
  }



  @Put('move')
  moveItem(@Body('sourcePath') sourcePath: string, @Body('destinationPath') destinationPath: string) {
    return this.filesService.moveItem(sourcePath, destinationPath);
  }

}
