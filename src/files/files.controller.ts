import { Controller, Get, Post, Param, UploadedFile, UseInterceptors, BadRequestException, Res, Body, Delete, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { FilesService } from './files.service';

import { fileFilter, fileNamer } from './helpers';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { GetFilesDto } from './dto/get-files.dto';
import { CreateFolderDto } from './dto/create-folder.dto';


@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
  ) { }

  @Get('image/:imageName')
  findImage(
    @Res() res: Response,
    @Param('imageName') imageName: string
  ) {

    const path = this.filesService.getStaticImage(imageName);

    res.sendFile(path);
  }



  @Post('image')
  @UseInterceptors(FileInterceptor('file', {
    fileFilter: fileFilter,
    // limits: { fileSize: 1000 }
    storage: diskStorage({
      destination: './static/images',
      filename: fileNamer
    })
  }))
  uploadImage(
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



  @Get('list-files')
  getFilesRoot() {
    return this.filesService.getFiles(undefined);
  }

  @Post('upload-file/:folderName')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const folderName = req.params.folderName;
          const folderPath = join('/drive', folderName);
          if (!existsSync(folderPath)) {
            mkdirSync(folderPath, { recursive: true });
          }
          cb(null, folderPath);
        },
        filename: (req, file, cb) => {
          cb(null, file.originalname);
        },
      }),
    }),
  )
  uploadFile(@Param('folderName') folderName: string, @UploadedFile() file: Express.Multer.File) {
    return this.filesService.uploadFile(folderName, file);
  }

  @Delete('delete-folder/:folderName')
  deleteFolder(@Param('folderName') folderName: string) {
    return this.filesService.deleteFolder(folderName);
  }

  @Delete('delete-file/:folderName/:fileName')
  deleteFile(@Param('folderName') folderName: string, @Param('fileName') fileName: string) {
    return this.filesService.deleteFile(folderName, fileName);
  }

  @Put('rename')
  renameItem(@Body('currentPath') currentPath: string, @Body('newName') newName: string) {
    return this.filesService.renameItem(currentPath, newName);
  }

  @Put('move')
  moveItem(@Body('sourcePath') sourcePath: string, @Body('destinationPath') destinationPath: string) {
    return this.filesService.moveItem(sourcePath, destinationPath);
  }

}
