import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from 'src/config/envs';

import { BDT_CONFIG } from './constants/base-tecnica.constants';
import { ExtraccionDocumento, SCHEMA_EXTRACCION } from './prompts/extraccion.prompt';

export interface ResultadoExtraccionIa {
  datos: ExtraccionDocumento;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  /** true si la respuesta se cortó por límite de tokens (documento demasiado largo). */
  truncado: boolean;
}

export type EntradaDocumentoIa =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'pdf'; base64: string; nombreArchivo: string }
  | { tipo: 'imagen'; base64: string; mime: string };

/**
 * Cliente OpenAI propio de la base técnica (no pasa por GptService: aquí se necesita Structured
 * Outputs con JSON Schema estricto, entrada de PDF y el conteo de tokens de cada llamada).
 */
@Injectable()
export class BdtIaService {
  private readonly logger = new Logger(BdtIaService.name);
  private readonly openai = new OpenAI({ apiKey: envs.openaiApiKey });

  async extraerDocumento(promptSistema: string, entrada: EntradaDocumentoIa): Promise<ResultadoExtraccionIa> {
    const contenidoUsuario = this.buildContenido(entrada);

    const response = await this.openai.chat.completions.create({
      model: BDT_CONFIG.MODELO_EXTRACCION,
      temperature: 0,
      max_tokens: BDT_CONFIG.MAX_TOKENS_EXTRACCION,
      messages: [
        { role: 'system', content: promptSistema },
        { role: 'user', content: contenidoUsuario as any },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'extraccion_documento_tecnico', strict: true, schema: SCHEMA_EXTRACCION },
      },
    });

    const choice = response.choices[0];
    const truncado = choice?.finish_reason === 'length';
    const contenido = choice?.message?.content;
    if (!contenido) {
      throw new Error(choice?.message?.refusal || 'La IA no devolvió contenido');
    }

    let datos: ExtraccionDocumento;
    try {
      datos = JSON.parse(contenido);
    } catch {
      // Respuesta cortada a mitad del JSON: no hay nada recuperable de forma fiable.
      throw new Error(
        truncado
          ? 'El documento es demasiado extenso para extraerlo en una sola lectura (respuesta truncada)'
          : 'La IA devolvió un JSON inválido',
      );
    }

    return {
      datos,
      modelo: response.model,
      tokensEntrada: response.usage?.prompt_tokens ?? 0,
      tokensSalida: response.usage?.completion_tokens ?? 0,
      truncado,
    };
  }

  /** Llamada con respuesta JSON libre (chat en modo documentos, contenido de publicación). */
  async completarJson<T>(
    messages: OpenAI.ChatCompletionMessageParam[],
    schema: Record<string, unknown>,
    nombre: string,
    opts: { modelo?: string; temperatura?: number; maxTokens?: number } = {},
  ): Promise<{ datos: T; tokensEntrada: number; tokensSalida: number; modelo: string }> {
    const response = await this.openai.chat.completions.create({
      model: opts.modelo ?? BDT_CONFIG.MODELO_CHAT,
      temperature: opts.temperatura ?? 0.1,
      max_tokens: opts.maxTokens ?? 2000,
      messages,
      response_format: { type: 'json_schema', json_schema: { name: nombre, strict: true, schema } },
    });
    const contenido = response.choices[0]?.message?.content;
    if (!contenido) throw new Error('La IA no devolvió contenido');
    return {
      datos: JSON.parse(contenido) as T,
      tokensEntrada: response.usage?.prompt_tokens ?? 0,
      tokensSalida: response.usage?.completion_tokens ?? 0,
      modelo: response.model,
    };
  }

  /** Una vuelta del agente QuimIA: la IA responde o pide ejecutar herramientas (function calling). */
  async completarConHerramientas(messages: OpenAI.ChatCompletionMessageParam[], tools: OpenAI.ChatCompletionTool[]) {
    const response = await this.openai.chat.completions.create({
      model: BDT_CONFIG.MODELO_AGENTE,
      temperature: 0.2,
      max_tokens: 1500,
      messages,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: true,
    });
    return {
      mensaje: response.choices[0]?.message,
      tokensEntrada: response.usage?.prompt_tokens ?? 0,
      tokensSalida: response.usage?.completion_tokens ?? 0,
      modelo: response.model,
    };
  }

  /** Respuesta en streaming (chat en modo IA general). */
  async completarStream(messages: OpenAI.ChatCompletionMessageParam[]) {
    return this.openai.chat.completions.create({
      model: BDT_CONFIG.MODELO_IA_GENERAL,
      temperature: 0.3,
      max_tokens: 1200,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });
  }

  private buildContenido(entrada: EntradaDocumentoIa): unknown[] {
    switch (entrada.tipo) {
      case 'texto':
        return [{ type: 'text', text: `DOCUMENTO:\n${entrada.texto}` }];
      case 'pdf':
        // Entrada de archivo PDF (la IA recibe texto + imagen de cada página). El SDK 4.67 aún no
        // tipa `type: 'file'`, pero la API lo acepta: se envía tal cual.
        return [
          { type: 'text', text: 'Documento escaneado adjunto. Extrae la información según las instrucciones.' },
          {
            type: 'file',
            file: { filename: entrada.nombreArchivo, file_data: `data:application/pdf;base64,${entrada.base64}` },
          },
        ];
      case 'imagen':
        return [
          { type: 'text', text: 'Documento en imagen adjunto. Extrae la información según las instrucciones.' },
          { type: 'image_url', image_url: { url: `data:${entrada.mime};base64,${entrada.base64}`, detail: 'high' } },
        ];
    }
  }
}
