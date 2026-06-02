import * as fs from 'fs';
import * as path from 'path';

import { Injectable, NotFoundException } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from 'src/config/envs';

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
import {
  audioToTextUseCase,
  imageGenerationUseCase,
  imageVariationUseCase,
  orthographyCheckUseCase,
  prosConsDicusserStreamUseCase,
  prosConsDicusserUseCase,
  textToAudioUseCase,
  translateUseCase,
  contentProductUseCase,
} from './use-cases';

@Injectable()
export class GptService {
  private openai = new OpenAI({
    apiKey: envs.openaiApiKey,
  });

  // Solo va a llamar casos de uso

  async orthographyCheck(orthographyDto: OrthographyDto) {
    return await orthographyCheckUseCase(this.openai, {
      prompt: orthographyDto.prompt,
    });
  }

  async prosConsDicusser({ prompt }: ProsConsDiscusserDto) {
    return await prosConsDicusserUseCase(this.openai, { prompt });
  }

  async prosConsDicusserStream({ prompt }: ProsConsDiscusserDto) {
    return await prosConsDicusserStreamUseCase(this.openai, { prompt });
  }

  async translateText({ prompt, lang }: TranslateDto) {
    return await translateUseCase(this.openai, { prompt, lang });
  }

  async textToAudio({ prompt, voice }: TextToAudioDto) {
    return await textToAudioUseCase(this.openai, { prompt, voice });
  }

  async textToAudioGetter(fileId: string) {
    const filePath = path.resolve(__dirname, '../../generated/audios/', `${fileId}.mp3`);

    const wasFound = fs.existsSync(filePath);

    if (!wasFound) throw new NotFoundException(`File ${fileId} not found`);

    return filePath;
  }

  async audioToText(audioFile: Express.Multer.File, audioToTextDto: AudioToTextDto) {
    const { prompt } = audioToTextDto;

    return await audioToTextUseCase(this.openai, { audioFile, prompt });
  }

  async imageGeneration(imageGenerationDto: ImageGenerationDto) {
    return await imageGenerationUseCase(this.openai, { ...imageGenerationDto });
  }

  getGeneratedImage(fileName: string) {
    const filePath = path.resolve('./', './generated/images/', fileName);
    const exists = fs.existsSync(filePath);

    if (!exists) {
      throw new NotFoundException('File not found');
    }

    return filePath;
  }

  async geneateImageVariation({ baseImage }: ImageVariationDto) {
    return imageVariationUseCase(this.openai, { baseImage });
  }

  async generateContentProduct({ product }: ContentProductDto) {
    return await contentProductUseCase(this.openai, { product });
  }

  async parseTextToJson(prompt: string, text: string) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: `Texto a analizar:\n${text}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No se pudo obtener respuesta de OpenAI');
    }

    return JSON.parse(content);
  }

  async parseImageToJson(prompt: string, imageBuffer: Buffer, mimeType: string) {
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analiza esta imagen de comprobante de transferencia y extrae los datos solicitados.',
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No se pudo obtener respuesta de OpenAI');
    }

    return JSON.parse(content);
  }
}
