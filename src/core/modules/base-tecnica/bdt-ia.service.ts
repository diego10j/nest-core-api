import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from 'src/config/envs';

import { BDT_CONFIG } from './constants/base-tecnica.constants';
import { ExtraccionDocumento, SCHEMA_EXTRACCION } from './prompts/extraccion.prompt';

/** 40+ saltos de línea / espacios seguidos al final de la respuesta = el modelo quedó en bucle. */
const BUCLE_SALIDA = /(?:\\n|\\u000a|\\r|\s){40,}$/;

/** La respuesta de extracción entró en bucle y se cortó (se puede reintentar). */
export class BucleSalidaError extends Error {}

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

  async extraerDocumento(
    promptSistema: string,
    entrada: EntradaDocumentoIa,
    modelo: string = BDT_CONFIG.MODELO_EXTRACCION,
    maxTokens: number = BDT_CONFIG.MAX_TOKENS_EXTRACCION,
  ): Promise<ResultadoExtraccionIa> {
    const contenidoUsuario = this.buildContenido(entrada);

    // En streaming para cortar a tiempo si el modelo entra en bucle: a veces, tras transcribir bien,
    // sigue escribiendo "\n" hasta el límite de tokens (se pagarían miles de tokens basura).
    const stream = await this.openai.chat.completions.create({
      model: modelo,
      temperature: 0,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: promptSistema },
        { role: 'user', content: contenidoUsuario as any },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'extraccion_documento_tecnico', strict: true, schema: SCHEMA_EXTRACCION },
      },
    });

    let contenido = '';
    let finRazon: string | null = null;
    let modeloUsado = modelo;
    let refusal = '';
    let usage: OpenAI.CompletionUsage | undefined;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      contenido += delta?.content ?? '';
      refusal += (delta as { refusal?: string } | undefined)?.refusal ?? '';
      finRazon = chunk.choices[0]?.finish_reason ?? finRazon;
      modeloUsado = chunk.model || modeloUsado;
      if (chunk.usage) usage = chunk.usage;
      if (BUCLE_SALIDA.test(contenido.slice(-400))) {
        stream.controller.abort();
        throw new BucleSalidaError(`${modeloUsado}: la respuesta entró en bucle (saltos de línea repetidos)`);
      }
    }

    const truncado = finRazon === 'length';
    if (!contenido) {
      throw new Error(refusal || 'La IA no devolvió contenido');
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
      modelo: modeloUsado,
      tokensEntrada: usage?.prompt_tokens ?? 0,
      tokensSalida: usage?.completion_tokens ?? 0,
      truncado,
    };
  }

  /**
   * Transcripción en texto plano de un escaneado/imagen (sin JSON: la transcripción larga dentro de
   * una respuesta estructurada hacía entrar al modelo en bucle). Páginas marcadas <<<PÁGINA N>>>.
   */
  async transcribirDocumento(entrada: EntradaDocumentoIa): Promise<{ texto: string; modelo: string; tokensEntrada: number; tokensSalida: number }> {
    const response = await this.openai.chat.completions.create({
      model: BDT_CONFIG.MODELO_TRANSCRIPCION,
      temperature: 0,
      max_tokens: BDT_CONFIG.MAX_TOKENS_TRANSCRIPCION,
      messages: [
        {
          role: 'system',
          content:
            'Transcribe TODO el texto visible de este documento escaneado, página por página, en su idioma original, ' +
            'sin traducir ni resumir. Antes de cada página escribe una línea "<<<PÁGINA N>>>". Tablas: una fila por ' +
            'línea con las celdas separadas por " | ". No agregues comentarios ni líneas en blanco repetidas. ' +
            'Termina al acabar la última página.',
        },
        { role: 'user', content: this.buildContenido(entrada).filter((c: any) => c.type !== 'text') as any },
      ],
    });
    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') throw new Error('La transcripción superó el límite de tokens');
    return {
      texto: choice?.message?.content?.trim() ?? '',
      modelo: response.model,
      tokensEntrada: response.usage?.prompt_tokens ?? 0,
      tokensSalida: response.usage?.completion_tokens ?? 0,
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
      // 0: respuestas pegadas a lo que devuelven las herramientas (sin "completar" datos).
      temperature: 0,
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
