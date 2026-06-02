import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import {
  AudioToTextDto,
  ContentProductDto,
  ImageGenerationDto,
  ImageVariationDto,
  OrthographyDto,
  ProsConsDiscusserDto,
  TextToAudioDto,
  TranslateDto,
} from './dtos';
import { GptService } from './gpt.service';

@ApiTags('Integración-GPT')
@Controller('gpt')
export class GptController {
  constructor(private readonly gptService: GptService) {}

  @Post('orthography-check')
  @ApiOperation({ summary: 'Verificar ortografía de un texto usando GPT' })
  orthographyCheck(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() orthographyDto: OrthographyDto,
  ) {
    return this.gptService.orthographyCheck(orthographyDto);
  }

  @Post('pros-cons-discusser')
  @ApiOperation({ summary: 'Generar análisis de pros y contras de un tema usando GPT' })
  prosConsDicusser(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() prosConsDiscusserDto: ProsConsDiscusserDto,
  ) {
    return this.gptService.prosConsDicusser(prosConsDiscusserDto);
  }

  @Post('pros-cons-discusser-stream')
  @ApiOperation({ summary: 'Generar análisis de pros y contras en modo streaming' })
  async prosConsDicusserStream(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() prosConsDiscusserDto: ProsConsDiscusserDto,
    @Res() res: Response,
  ) {
    const stream = await this.gptService.prosConsDicusserStream(prosConsDiscusserDto);

    res.setHeader('Content-Type', 'application/json');
    res.status(HttpStatus.OK);

    for await (const chunk of stream) {
      const piece = chunk.choices[0].delta.content || '';
      res.write(piece);
    }

    res.end();
  }

  @Post('translate')
  @ApiOperation({ summary: 'Traducir texto entre idiomas usando GPT' })
  translateText(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() translateDto: TranslateDto,
  ) {
    return this.gptService.translateText(translateDto);
  }

  @Get('text-to-audio/:fileId')
  @ApiOperation({ summary: 'Descargar archivo de audio generado previamente por ID' })
  async textToAudioGetter(
    @AppHeaders() _h: HeaderParamsDto,
    @Res() res: Response,
    @Param('fileId') fileId: string,
  ) {
    const filePath = await this.gptService.textToAudioGetter(fileId);

    res.setHeader('Content-Type', 'audio/mp3');
    res.status(HttpStatus.OK);
    res.sendFile(filePath);
  }

  @Post('text-to-audio')
  @ApiOperation({ summary: 'Convertir texto a audio mp3 usando GPT TTS' })
  async textToAudio(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() textToAudioDto: TextToAudioDto,
    @Res() res: Response,
  ) {
    const filePath = await this.gptService.textToAudio(textToAudioDto);

    res.setHeader('Content-Type', 'audio/mp3');
    res.status(HttpStatus.OK);
    res.sendFile(filePath);
  }

  @Post('audio-to-text')
  @ApiOperation({ summary: 'Transcribir archivo de audio a texto usando Whisper (máx 5MB)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './generated/uploads',
        filename: (req, file, callback) => {
          const fileExtension = file.originalname.split('.').pop();
          const fileName = `${new Date().getTime()}.${fileExtension}`;
          return callback(null, fileName);
        },
      }),
    }),
  )
  async audioToText(
    @AppHeaders() _h: HeaderParamsDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 1000 * 1024 * 5,
            message: 'File is bigger than 5 mb ',
          }),
          new FileTypeValidator({ fileType: 'audio/*' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() audioToTextDto: AudioToTextDto,
  ) {
    return this.gptService.audioToText(file, audioToTextDto);
  }

  @Post('image-generation')
  @ApiOperation({ summary: 'Generar imagen con DALL-E a partir de una descripción' })
  async imageGeneration(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() imageGenerationDto: ImageGenerationDto,
  ) {
    return await this.gptService.imageGeneration(imageGenerationDto);
  }

  @Get('image-generation/:filename')
  @ApiOperation({ summary: 'Obtener imagen generada por nombre de archivo' })
  async getGenerated(
    @AppHeaders() _h: HeaderParamsDto,
    @Res() res: Response,
    @Param('filename') fileName: string,
  ) {
    const filePath = this.gptService.getGeneratedImage(fileName);
    res.status(HttpStatus.OK);
    res.sendFile(filePath);
  }

  @Post('image-variation')
  @ApiOperation({ summary: 'Generar variaciones de una imagen existente con DALL-E' })
  async imageVariation(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() imageVariationDto: ImageVariationDto,
  ) {
    return await this.gptService.geneateImageVariation(imageVariationDto);
  }

  @Post('generateContentProduct')
  @ApiOperation({ summary: 'Generar descripción y contenido de un producto con GPT' })
  generateContentProduct(
    @AppHeaders() _h: HeaderParamsDto,
    @Body() contentProductDto: ContentProductDto,
  ) {
    return this.gptService.generateContentProduct(contentProductDto);
  }
}
