import { Controller, Get, Post, Param, UploadedFile, UseInterceptors, BadRequestException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { FilesService } from './files.service';

import { fileFilter, fileNamer } from './helpers';


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

}
