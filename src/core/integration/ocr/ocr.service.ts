import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { envs } from 'src/config/envs';

interface OcrSpaceResult {
  ParsedResults: Array<{
    TextOverlay: { Lines: unknown[]; HasOverlay: boolean; Message: string };
    FileParseExitCode: number;
    ParsedText: string;
    ErrorMessage: string;
    ErrorDetails: string;
  }>;
  OCRExitCode: number;
  IsErroredOnProcessing: boolean;
  ProcessingTimeInMilliseconds: string;
  SearchablePDFURL: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly OCR_API_URL = 'https://api.ocr.space/parse/image';
  private readonly API_KEY = envs.ocrSpaceApiKey;
  private readonly TIMEOUT_MS = envs.ocrSpaceTimeoutMs;

  constructor(private readonly httpService: HttpService) {}

  async extractTextFromImage(imageBuffer: Buffer, fileName: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', imageBuffer, { filename: fileName, contentType: 'image/png' });
    formData.append('apikey', this.API_KEY);
    formData.append('language', 'spa');
    formData.append('OCREngine', '2');
    formData.append('scale', 'true');
    formData.append('isTable', 'false');

    try {
      const response = await firstValueFrom(
        this.httpService.post<OcrSpaceResult>(this.OCR_API_URL, formData, {
          headers: formData.getHeaders(),
          timeout: this.TIMEOUT_MS,
        }),
      );

      const result = response.data;

      if (result.OCRExitCode !== 1 && result.OCRExitCode !== 2) {
        this.logger.error(`OCR.space error: ExitCode=${result.OCRExitCode}`, result);
        throw new InternalServerErrorException(
          'Error al procesar la imagen con OCR: ' +
            (result.ParsedResults?.[0]?.ErrorMessage || 'Error desconocido'),
        );
      }

      const parsedText = result.ParsedResults?.[0]?.ParsedText || '';

      if (!parsedText.trim()) {
        throw new InternalServerErrorException(
          'No se pudo extraer texto de la imagen. Verifique que la imagen sea legible.',
        );
      }

      this.logger.log(`OCR completado en ${result.ProcessingTimeInMilliseconds}ms`);
      return parsedText;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error('Error al llamar a OCR.space', error);
      throw new InternalServerErrorException(
        `Error al comunicarse con el servicio OCR: ${error.message}`,
      );
    }
  }
}
