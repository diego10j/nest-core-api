import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from 'src/config/envs';

export type IntencionCliente = 'CONFIRMAR' | 'CANCELAR' | 'ASESOR' | 'LISTO' | 'SALIR' | 'OTRO';
export type IntencionConsulta = 'UBICACION' | 'HORARIO' | 'ENVIO' | 'CATALOGO' | 'PRODUCTO' | 'GENERAL';

@Injectable()
export class BotGptService {
  private readonly logger = new Logger(BotGptService.name);
  private readonly openai = new OpenAI({ apiKey: envs.openaiApiKey });

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

  async generateResponse(
    systemPrompt: string,
    historial: { role: 'user' | 'assistant'; content: string }[],
    mensajeActual: string,
    contextoExtra?: string,
  ): Promise<string> {
    const sysContent = contextoExtra
      ? `${systemPrompt}\n\n--- Contexto actual ---\n${contextoExtra}`
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
      return resp.choices[0]?.message?.content?.trim() ?? 'Lo siento, tuve un inconveniente. ¿Podrías repetir?';
    } catch (err) {
      this.logger.error(`generateResponse error: ${err.message}`);
      return 'Disculpa, ocurrió un problema procesando tu mensaje. Por favor intenta de nuevo.';
    }
  }

  async detectarIntencion(texto: string): Promise<IntencionCliente> {
    const t = texto.trim().toUpperCase();

    if (/^(SI|SÍ|S[Ii]|YES|OK|OKEY|DALE|ADELANTE|CONTINUAR|ASISTENTE|BOT)$/.test(t)) return 'CONFIRMAR';
    if (/^(NO|CANCELAR)$/.test(t)) return 'CANCELAR';
    if (/^SALIR$/.test(t)) return 'SALIR';
    if (/ASESOR|AGENTE|HUMANO|PERSONA|VENDEDOR/.test(t)) return 'ASESOR';
    if (/^(LISTO|FIN|FINALIZAR|TERMINAR|ESO ES TODO|YA)$/.test(t)) return 'LISTO';

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Clasifica el mensaje del cliente en UNA categoría: CONFIRMAR, CANCELAR, ASESOR, LISTO, SALIR, OTRO. '
              + 'CONFIRMAR=acepta/sí. CANCELAR=rechaza/no. ASESOR=quiere persona humana. '
              + 'LISTO=terminó productos. SALIR=quiere salir. OTRO=cualquier otra cosa. '
              + 'Responde SOLO la categoría en mayúsculas.',
          },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 10,
      });
      const cat = resp.choices[0]?.message?.content?.trim().toUpperCase() as IntencionCliente;
      if (['CONFIRMAR', 'CANCELAR', 'ASESOR', 'LISTO', 'SALIR', 'OTRO'].includes(cat)) return cat;
    } catch { /* silencio */ }

    return 'OTRO';
  }

  async clasificarConsulta(texto: string): Promise<IntencionConsulta> {
    const t = texto.toUpperCase();

    // UBICACION: incluye preguntas sobre sucursales, sedes, locales en otras ciudades
    if (/UBICACI[OÓ]N|DIRECCI[OÓ]N|D[OÓ]NDE EST[AÁ]N|COMO LLEGAR|MAPA|VALLE|CHILLOS|ESTADIO|SUCURSAL|SEDE|PUNTO\s*DE\s*VENTA/.test(t)) return 'UBICACION';
    if (/HORARIO|QU[EÉ] HORA|ABREN|CIERRAN|ATIENDEN|LUNES|VIERNES|S[AÁ]BADO/.test(t)) return 'HORARIO';
    if (/ENV[IÍ]O|ENV[IÍ]AN|DESPACHO|TRANSPORTE|DELIVER|NACIONAL|OTRA CIUDAD/.test(t)) return 'ENVIO';
    if (/CAT[AÁ]LOGO|LISTA DE PRECIOS|PRECIO|LISTA DE PRODUCTO/.test(t)) return 'CATALOGO';
    // PRODUCTO: TIENE[N] removido — muy ambiguo (captura "tienen sucursal en X")
    if (/PRODUCTO|COTIZACI[OÓ]N|COTIZAR|COMPRAR|NECESITO|QUIERO|PEDIR|ORDEN|DISPONE[N]?|HAY\s+|DISPONIB|CONSIGO|VENDEN?|EXISTENCIA|STOCK/.test(t)) return 'PRODUCTO';

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Clasifica el mensaje de un cliente en: UBICACION, HORARIO, ENVIO, CATALOGO, PRODUCTO, GENERAL.\n'
              + 'UBICACION = dirección, cómo llegar, si tienen sucursal/sede/local/tienda en otra ciudad.\n'
              + 'HORARIO = horarios de atención, si están abiertos.\n'
              + 'ENVIO = envíos, despacho, costo de envío a otras ciudades.\n'
              + 'CATALOGO = lista de precios, catálogo de productos.\n'
              + 'PRODUCTO = disponibilidad, precio o compra de un producto específico. NO incluye preguntas sobre sucursales.\n'
              + 'GENERAL = saludos u otras consultas.\n'
              + 'Ejemplos: "tienen sucursal en Cuenca"→UBICACION | "envían a Guayaquil"→ENVIO | "tienen cera de palma"→PRODUCTO | "qué horario tienen"→HORARIO.\n'
              + 'Responde SOLO la categoría en mayúsculas.',
          },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 10,
      });
      const cat = resp.choices[0]?.message?.content?.trim().toUpperCase() as IntencionConsulta;
      if (['UBICACION', 'HORARIO', 'ENVIO', 'CATALOGO', 'PRODUCTO', 'GENERAL'].includes(cat)) return cat;
    } catch { /* silencio */ }

    return 'GENERAL';
  }

  /**
   * Extrae la cantidad numérica de un texto libre.
   * Entiende expresiones como "dos kilos", "media docena", "un par", "5".
   * Devuelve null si no hay una cantidad reconocible.
   */
  async extraerCantidad(texto: string): Promise<number | null> {
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Extrae la cantidad numérica del texto. Responde SOLO con el número (entero o decimal con punto). '
              + 'Ejemplos: "quiero 5 kilos"→5, "dos litros"→2, "media docena"→6, "un par"→2, "necesito uno"→1. '
              + 'Si no hay cantidad clara responde null.',
          },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 10,
      });
      const raw = resp.choices[0]?.message?.content?.trim() ?? '';
      if (!raw || raw.toLowerCase() === 'null') return null;
      const num = parseFloat(raw.replace(',', '.'));
      return isNaN(num) || num <= 0 ? null : num;
    } catch (err) {
      this.logger.error(`extraerCantidad error: ${err.message}`);
      return null;
    }
  }

  async analizarProductoNoEncontrado(
    texto: string,
    productosYaAgregados: string[] = [],
    nombreBot: string = 'Asistente',
    nombreEmpresa: string = 'la empresa',
    promptSistema?: string,
  ): Promise<{ tipo: 'INFO' | 'PRODUCTO' | 'IRRELEVANTE'; respuesta: string }> {
    const ctx = productosYaAgregados.length
      ? `Productos ya cotizados: ${productosYaAgregados.join(', ')}.`
      : '';
    const sysBase = promptSistema
      ? `${promptSistema}\n\n${ctx}`
      : `Eres ${nombreBot}, asesora comercial de ${nombreEmpresa}. ${ctx}`;
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `${sysBase}
El cliente está cotizando y escribió algo que no coincidió con ningún producto del catálogo.
Responde en JSON: {"tipo":"INFO|PRODUCTO|IRRELEVANTE","respuesta":"texto para el cliente"}
INFO = pregunta de ubicación/horario/envíos/catálogo → responde la info y pide continuar cotizando.
PRODUCTO = nombre de producto poco claro → sugiere escribir solo el nombre principal sin cantidades ni unidades.
IRRELEVANTE = fuera de contexto → responde brevemente y pide continuar.
Tono: amable, profesional. Máximo 2 párrafos cortos.`,
          },
          { role: 'user', content: texto },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 220,
      });
      const parsed = JSON.parse(resp.choices[0]?.message?.content || '{}');
      if (['INFO', 'PRODUCTO', 'IRRELEVANTE'].includes(parsed.tipo) && parsed.respuesta) {
        return parsed;
      }
    } catch (err) {
      this.logger.error(`analizarProductoNoEncontrado error: ${err.message}`);
    }
    return {
      tipo: 'PRODUCTO',
      respuesta: `No encontré ese producto en nuestro catálogo 🤔\n\n💡 Escribe solo el nombre principal del producto, sin cantidades ni unidades.\n_Ej: "cera de palma" en lugar de "cera de palma 25kg"_`,
    };
  }
}
