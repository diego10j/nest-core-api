import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from 'src/config/envs';

@Injectable()
export class BotGptService {
  private readonly logger = new Logger(BotGptService.name);
  private readonly openai = new OpenAI({ apiKey: envs.openaiApiKey });

  /**
   * Extrae producto y cantidad de un texto libre del cliente.
   * Usa max_tokens=100 — llamada muy barata.
   */
  async extractProductoCantidad(texto: string): Promise<{ producto: string; cantidad: number } | null> {
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Extrae el nombre del producto y la cantidad del texto del cliente. '
              + 'Responde SOLO con JSON válido: {"producto": "nombre del producto", "cantidad": N}. '
              + 'Si no hay cantidad explícita usa 1. Si no hay producto claro devuelve null.',
          },
          { role: 'user', content: texto },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 80,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return null;
      return JSON.parse(content);
    } catch (err) {
      this.logger.error(`extractProductoCantidad error: ${err.message}`);
      return null;
    }
  }

  /**
   * Genera la respuesta conversacional del bot.
   * Envía solo los últimos 10 mensajes del historial para controlar costos.
   */
  async generateResponse(
    systemPrompt: string,
    historial: { role: 'user' | 'assistant'; content: string }[],
    mensajeActual: string,
    contextoExtra?: string,   // datos de sesión resumidos para enriquecer el contexto
  ): Promise<string> {
    const sysContent = contextoExtra
      ? `${systemPrompt}\n\n--- Contexto actual de la sesión ---\n${contextoExtra}`
      : systemPrompt;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: sysContent },
      ...historial.slice(-10),
      { role: 'user', content: mensajeActual },
    ];

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 350,
      });
      return resp.choices[0]?.message?.content?.trim() ?? 'Lo siento, tuve un inconveniente. ¿Podrías repetir tu mensaje?';
    } catch (err) {
      this.logger.error(`generateResponse error: ${err.message}`);
      return 'Disculpa, ocurrió un problema procesando tu mensaje. Por favor intenta de nuevo.';
    }
  }

  /**
   * Normaliza la respuesta de un cliente para detectar intenciones clave.
   * Muy barato (max_tokens=30).
   */
  async detectarIntencion(texto: string): Promise<'CONFIRMAR' | 'CANCELAR' | 'ASESOR' | 'LISTO' | 'OTRO'> {
    const textoNorm = texto.trim().toUpperCase();

    // Detección directa sin GPT (ahorra tokens en casos obvios)
    if (/^(SI|SÍ|S[Ii]|YES|OK|OKEY|DALE|ADELANTE|CONTINUAR|ASISTENTE|BOT)$/.test(textoNorm)) return 'CONFIRMAR';
    if (/^(NO|CANCELAR|SALIR)$/.test(textoNorm)) return 'CANCELAR';
    if (/ASESOR|AGENTE|HUMANO|PERSONA|VENDEDOR/.test(textoNorm)) return 'ASESOR';
    if (/^(LISTO|FIN|FINALIZAR|TERMINAR|ESO ES TODO|ESO ES|YA)$/.test(textoNorm)) return 'LISTO';

    // Solo llamar GPT si el texto es ambiguo
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Clasifica el mensaje del cliente en UNA de estas categorías: CONFIRMAR, CANCELAR, ASESOR, LISTO, OTRO. '
              + 'CONFIRMAR=acepta/dice sí. CANCELAR=rechaza/dice no. ASESOR=quiere hablar con una persona. '
              + 'LISTO=terminó de listar productos. OTRO=cualquier otra cosa. '
              + 'Responde SOLO la categoría en mayúsculas.',
          },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 10,
      });
      const cat = resp.choices[0]?.message?.content?.trim().toUpperCase();
      if (['CONFIRMAR', 'CANCELAR', 'ASESOR', 'LISTO', 'OTRO'].includes(cat)) {
        return cat as any;
      }
    } catch { /* silencio */ }

    return 'OTRO';
  }
}
