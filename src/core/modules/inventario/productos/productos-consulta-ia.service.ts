import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { GptService } from 'src/core/integration/gpt/gpt.service';

import { ConsultarIaProductoDto } from './dto/consultar-ia-producto.dto';
import { MensajeHistorialDto } from './dto/mensaje-historial.dto';

export const MAX_PREGUNTAS_CONSULTA_IA = 3;

const MENSAJE_LIMITE_ALCANZADO = [
  'Ya alcanzaste el máximo de 3 preguntas para esta consulta. 🙌',
  '',
  '📱 Escríbenos al 0998931505: https://wa.me/593998931505?text=Consulta',
  '🛒 O cotiza en línea: https://diquimec.com.ec/product/checkout',
].join('\n');

interface RespuestaConsultaIa {
  limitReached: boolean;
  mensaje?: string;
  stream?: Awaited<ReturnType<GptService['chatCompletionStream']>>;
}

/**
 * El catálogo del portal web vive en una base de datos aparte (page-diquimec no está
 * integrado al ERP), por lo que aquí no hay `ide_inarti` ni ninguna otra FK válida hacia
 * `inv_articulo` — el único contexto de producto disponible es el nombre en texto que
 * manda el frontend, igual que hacía el backend legacy (`getRespuestaPregunta(pregunta,
 * nombreProducto)`).
 */
@Injectable()
export class ProductosConsultaIaService {
  constructor(private readonly gptService: GptService) { }

  /** Cuenta las preguntas ya respondidas en la sesión a partir del historial que manda el
   * frontend (no hay persistencia server-side para esta funcionalidad). */
  contarPreguntasRealizadas(historial: MensajeHistorialDto[]): number {
    return historial.filter((m) => m.role === 'user').length;
  }

  async responder(dtoIn: ConsultarIaProductoDto): Promise<RespuestaConsultaIa> {
    const preguntasRealizadas = this.contarPreguntasRealizadas(dtoIn.historial);

    if (preguntasRealizadas >= MAX_PREGUNTAS_CONSULTA_IA) {
      return { limitReached: true, mensaje: MENSAJE_LIMITE_ALCANZADO };
    }

    const systemPrompt = this.buildSystemPrompt(dtoIn.nombreProducto, dtoIn.descripcionProducto);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...dtoIn.historial.map(
        (m) => ({ role: m.role, content: m.contenido }) as OpenAI.ChatCompletionMessageParam,
      ),
      { role: 'user', content: dtoIn.pregunta },
    ];

    // gpt-4o (no el "mini"): son respuestas técnicas de química/formulación que deben ser
    // precisas y confiables — el backend legacy ya usaba gpt-4o completo por esta misma
    // razón. Temperatura baja para reducir alucinación de datos técnicos.
    const stream = await this.gptService.chatCompletionStream(messages, {
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 1000,
    });

    return { limitReached: false, stream };
  }

  private buildSystemPrompt(
    nombreProducto: string | undefined,
    descripcionProducto: string | undefined,
  ): string {
    const fichaTecnica = this.limpiarFichaTecnica(descripcionProducto);

    const bloqueProducto = fichaTecnica
      ? `FICHA TÉCNICA DEL PRODUCTO "${nombreProducto ?? ''}" (información real de DIQUIMEC —
úsala como fuente PRINCIPAL y prioritaria para responder sobre dosificación, usos,
aplicaciones, especificaciones técnicas e INCI; tiene prioridad sobre tu conocimiento
general del tema):
"""
${fichaTecnica}
"""`
      : nombreProducto
        ? `El usuario está consultando sobre el producto: "${nombreProducto}".`
        : '';

    return `
Eres QuimIA, asistente comercial de DIQUIMEC, empresa ecuatoriana proveedora de materias
primas e insumos químicos para la industria (cosmética, alimentaria, farmacéutica, textil,
limpieza, pinturas, plásticos y manufactura en general).

CÓMO RESPONDER:
- Responde en español, de forma directa, técnica y profesional.
- Si la ficha técnica del producto (más abajo) responde la pregunta, básate en ella —
  es información real de DIQUIMEC, no la contradigas ni la completes con suposiciones.
- Si la pregunta pide algo que la ficha técnica NO cubre, no inventes datos técnicos (CAS,
  pureza exacta, etc.); en ese caso indica que las especificaciones varían según el
  lote/proveedor o recomienda confirmar con un asesor.
- No confirmes precios exactos ni disponibilidad/stock puntual — nunca los conoces con
  certeza en este canal.
- Respuestas concretas, máximo 4-5 oraciones salvo que la complejidad técnica lo amerite.

${bloqueProducto}

REGLA OBLIGATORIA DE PRECIO/DISPONIBILIDAD:
Cuando la pregunta del usuario trate sobre precio, costo, valor, disponibilidad o stock, tu
respuesta DEBE terminar reproduciendo EXACTAMENTE este bloque, sin traducirlo ni modificarlo:

📱 Escríbenos al 0998931505: https://wa.me/593998931505?text=Consulta
🛒 O cotiza en línea: https://diquimec.com.ec/product/checkout

Si la pregunta no está relacionada con química, materias primas o el producto consultado,
indícalo brevemente y sugiere contactar a un asesor de DIQUIMEC. Nunca recomiendes
proveedores o tiendas distintas a DIQUIMEC.
    `.trim();
  }

  /** El frontend ya manda texto limpio (sin HTML), pero por si llega con tags residuales
   * y para acotar el costo/tamaño del prompt, se recorta a un máximo razonable. */
  private limpiarFichaTecnica(descripcion: string | undefined): string | null {
    if (!descripcion) return null;

    const texto = descripcion
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!texto) return null;

    const MAX_CHARS = 4000;
    return texto.length > MAX_CHARS ? `${texto.slice(0, MAX_CHARS)}…` : texto;
  }
}
