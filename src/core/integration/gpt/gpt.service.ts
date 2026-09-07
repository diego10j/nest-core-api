import * as fs from 'fs';
import * as path from 'path';

import { Injectable, NotFoundException } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from 'src/config/envs';

import {
  AudioToTextDto,
  ContentProductDto,
  DetectCxcDifferencesDto,
  ImageGenerationDto,
  ImageVariationDto,
  OrthographyDto,
  ProsConsDiscusserDto,
  TextToAudioDto,
  TextToolDto,
  TranslateDto,
} from './dtos';
import {
  audioToTextUseCase,
  correctSpellingUseCase,
  imageGenerationUseCase,
  imageVariationUseCase,
  improveTextUseCase,
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

  async correctSpelling({ prompt }: TextToolDto) {
    return await correctSpellingUseCase(this.openai, { prompt });
  }

  async improveText({ prompt }: TextToolDto) {
    return await improveTextUseCase(this.openai, { prompt });
  }

  /**
   * "Detectar diferencias con IA" en Diferencias Contable vs CxC: recibe los asientos
   * contables (cuenta Clientes) y las transacciones CxC de un mismo cliente, ya
   * calculados/truncados por el frontend, y le pide a GPT que encuentre la causa
   * probable del descuadre entre saldoContable y saldoCxc.
   */
  async detectCxcDifferences(dto: DetectCxcDifferencesDto) {
    const systemPrompt = `
      Eres un contador auditor experto en conciliación de cuentas por cobrar. Se te
      entrega, en JSON, un cliente con su saldo contable (cuenta "Clientes") y su saldo
      de Cuentas por Cobrar (CxC) al cierre del rango consultado (fechaInicio-fechaFin),
      junto con el detalle de asientos contables (array "asientos", cada uno con
      debe/haber y saldo acumulado, incluyendo una fila "Saldo Inicial") y el detalle de
      transacciones CxC (array "transacciones", cada una con debe/haber y saldo
      acumulado, incluyendo una fila "Saldo Inicial") de ese mismo cliente en ese rango.

      Tu tarea es encontrar la causa probable de la diferencia entre saldoContable y
      saldoCxc (o confirmar que cuadra). Compara ambos lados: montos que aparecen en un
      lado y no en el otro, fechas cercanas con montos iguales que podrían ser el mismo
      movimiento mal registrado, asientos sin transacción CxC asociada o viceversa,
      diferencias de monto en movimientos que parecen corresponder al mismo hecho.

      Responde EXCLUSIVAMENTE con un JSON con esta forma exacta, sin texto adicional:
      {
        "resumen": "string breve en markdown explicando el diagnóstico general",
        "cuadra": boolean,
        "hallazgos": [
          { "titulo": "string", "detalle": "string", "impacto": number o null, "confianza": "alta" | "media" | "baja" }
        ]
      }
      Si no encuentras una causa clara, igual devuelve al menos un hallazgo describiendo
      qué información adicional ayudaría a diagnosticar. No inventes movimientos que no
      estén en los datos entregados.
    `;
    return this.parseTextToJson(systemPrompt, JSON.stringify(dto));
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
