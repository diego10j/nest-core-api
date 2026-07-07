import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { envs } from 'src/config/envs';

export type IntencionCliente = 'CONFIRMAR' | 'CANCELAR' | 'ASESOR' | 'LISTO' | 'SALIR' | 'OTRO';
export type IntencionConsulta = 'UBICACION' | 'HORARIO' | 'ENVIO' | 'CATALOGO' | 'PRODUCTO' | 'GENERAL';

@Injectable()
export class BotGptService {
  private readonly logger = new Logger(BotGptService.name);
  private readonly openai = new OpenAI({ apiKey: envs.openaiApiKey });

  /**
   * Transcribe una nota de voz de WhatsApp (normalmente audio/ogg). Devuelve `null` si
   * la llamada falla o el resultado viene vacío (silencio/ruido) — en ese caso el
   * llamador debe tratarlo como "audio no entendido" y derivar a un asesor humano.
   * Idioma forzado a español (todos los clientes de DIQUIMEC escriben en español) para
   * mejorar precisión frente a autodetección.
   */
  async transcribirAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
    try {
      const ext = mimeType.includes('ogg') ? 'ogg'
        : mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
        : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
        : mimeType.includes('wav') ? 'wav'
        : mimeType.includes('webm') ? 'webm'
        : 'ogg';

      const file = await toFile(buffer, `audio.${ext}`, { type: mimeType });
      const resp = await this.openai.audio.transcriptions.create({
        model: 'gpt-4o-mini-transcribe',
        file,
        language: 'es',
      });

      const texto = resp.text?.trim();
      return texto || null;
    } catch (err) {
      this.logger.error(`transcribirAudio error: ${err.message}`);
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
    // CATALOGO solo para pedidos GENÉRICOS de catálogo/lista de precios. "PRECIO" suelto
    // se quitó de acá: "¿cuál es el precio del sorbitol?" es una pregunta de PRODUCTO
    // específico y este atajo la clasificaba como CATALOGO (respuesta enlatada con los
    // links, dos veces seguidas, cliente abandonaba — caso real 2026-07-04).
    if (/CAT[AÁ]LOGO|LISTA DE PRECIOS|PRECIOS\b|LISTA DE PRODUCTO/.test(t)) return 'CATALOGO';
    // PRODUCTO: TIENE[N] removido — muy ambiguo (captura "tienen sucursal en X").
    // PRECIO (singular) va aquí: como CATALOGO se evalúa antes, "lista de precios"
    // sigue cayendo en CATALOGO, pero "precio de X"/"cuánto cuesta X" llega a PRODUCTO.
    if (/PRODUCTO|COTIZACI[OÓ]N|COTIZAR|COMPRAR|NECESITO|QUIERO|PEDIR|ORDEN|DISPONE[N]?|HAY\s+|DISPONIB|CONSIGO|VENDEN?|EXISTENCIA|STOCK|PRECIO\b|CU[AÁ]NTO\s+CUESTA|COSTO\s+DE/.test(t)) return 'PRODUCTO';

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
              + 'CATALOGO = pide el catálogo o la lista de precios EN GENERAL, sin nombrar un producto específico.\n'
              + 'PRODUCTO = disponibilidad, precio o compra de un producto específico (si nombra un producto concreto, es PRODUCTO aunque pregunte el precio). NO incluye preguntas sobre sucursales.\n'
              + 'GENERAL = saludos u otras consultas.\n'
              + 'Ejemplos: "tienen sucursal en Cuenca"→UBICACION | "envían a Guayaquil"→ENVIO | "tienen cera de palma"→PRODUCTO | "cuál es el precio del sorbitol"→PRODUCTO | "me pasas la lista de precios"→CATALOGO | "qué horario tienen"→HORARIO.\n'
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
   * Analiza el texto acumulado durante la captura de productos en lote.
   * Detecta si el cliente ya terminó de listar (FIN literal o cierre semántico)
   * y extrae todos los pares producto/cantidad mencionados hasta el momento.
   */
  async analizarLoteProductos(
    textoAcumulado: string,
    productosYaAgregados: string[] = [],
  ): Promise<{ completo: boolean; items: { producto: string; cantidad: number | null }[] }> {
    const ctx = productosYaAgregados.length
      ? `Ya fueron agregados a la cotización (no los repitas): ${productosYaAgregados.join(', ')}.`
      : '';
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'El cliente está listando productos y cantidades para una cotización, posiblemente en varios mensajes seguidos ' +
              '(separados por saltos de línea en el texto que recibes). ' +
              `${ctx}\n` +
              'Tu tarea:\n' +
              '1. "completo": true si el texto contiene la palabra FIN (aislada), si el cliente da a entender que ya terminó de listar ' +
              '(ej: "eso es todo", "ya", "nada más", "es todo por ahora", "listo"), O SI el mensaje es una pregunta o pedido ' +
              'autocontenido y aislado (ej: "me ayuda con el precio de la cera de soya, gracias", "¿cuánto cuesta X?", "necesito Y por favor") ' +
              '— en el español latinoamericano terminar con "gracias"/"por favor" es una forma normal y educada de cerrar una petición, NO ' +
              'significa que vaya a seguir agregando productos. Usa false SOLO si el mensaje deja explícito que seguirá agregando algo más ' +
              '(ej: "también quiero...", "y además...", "aparte necesito...", o una lista claramente a medias).\n' +
              '2. "items": arreglo con cada producto mencionado y su cantidad, normalizada así (el catálogo de esta empresa es ' +
              'prácticamente todo por peso, en KILOGRAMOS — ceras, parafinas, fragancias, aceites, polvos, etc.):\n' +
              '   - Si el cliente da la cantidad en una unidad de MASA distinta a kilogramos (gramos, miligramos, toneladas, ' +
              'libras), CONVIÉRTELA a kilogramos: 1000 mg = 1 g, 1000 g = 1 kg, 1 tonelada = 1000 kg, 1 libra (lb) = 0.453592 kg. ' +
              'Ejemplos: "100g de cera de palma"→cantidad:0.1 | "1 tonelada de parafina"→cantidad:1000.\n' +
              '   - Si el producto es una FRAGANCIA o ESENCIA (por su nombre) y el cliente da la cantidad en mililitros (ml), ' +
              'trátalo como gramos (densidad ≈ 1, 1ml = 1g) y conviértelo a kilogramos igual. ' +
              'Ejemplo: "10ml de fragancia vainilla"→cantidad:0.01.\n' +
              '   - Si el cliente da un conteo simple sin unidad de peso (ej: "5 moldes", "3 unidades", "media docena"→6, ' +
              '"un par"→2), NO apliques conversión de peso — usa el número/conteo tal cual (puede tratarse de un producto que ' +
              'se vende por unidad, no por peso).\n' +
              '   - Si no menciona ninguna cantidad para ese producto: cantidad: null.\n' +
              '   - cantidad: 0 si el cliente pide la cantidad mínima disponible ("cantidad mínima", "lo mínimo que manejen", "el mínimo") ' +
              'O si pide comprar al por mayor/mayorista sin dar una cifra concreta ("al por mayor", "por mayor", "para revender", "mayorista") — ' +
              'en ambos casos el asesor define la cantidad real después, se usa 0 como marcador.\n' +
              '   - Si el cliente menciona VARIANTES o presentaciones distintas de un mismo producto conectadas por "y" (ej. códigos/siglas ' +
              'como APF, BPF, tipo A, tipo B, u otras presentaciones), trátalas como PRODUCTOS SEPARADOS, uno por variante — NO las combines ' +
              'en un solo string. Ejemplo: "cera de soya de APF y BPF" → dos ítems: "cera de soya APF" y "cera de soya BPF".\n' +
              'Responde SOLO JSON válido: {"completo": bool, "items":[{"producto":"nombre del producto","cantidad": number|null}]}. ' +
              'No incluyas la palabra FIN ni frases de cierre como si fueran un producto.',
          },
          { role: 'user', content: textoAcumulado },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 400,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return { completo: false, items: [] };
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed.items)
        ? parsed.items
          .filter((i: any) => i && typeof i.producto === 'string' && i.producto.trim())
          .map((i: any) => ({
            producto: i.producto.trim(),
            cantidad: (i.cantidad === null || i.cantidad === undefined || isNaN(Number(i.cantidad)))
              ? null
              : Number(i.cantidad),
          }))
        : [];
      return { completo: !!parsed.completo, items };
    } catch (err) {
      this.logger.error(`analizarLoteProductos error: ${err.message}`);
      return { completo: false, items: [] };
    }
  }

  /**
   * Cuando hay que preguntar "para qué uso" de varios productos genéricos a la vez
   * (sabor/color/fragancia/aceite sin match en catálogo), interpreta la respuesta del
   * cliente y devuelve el uso de cada producto en el mismo orden que se le preguntaron.
   * null en la posición de un producto cuyo uso no se pudo identificar en la respuesta.
   */
  async extraerUsosPorProducto(productos: string[], respuesta: string): Promise<(string | null)[]> {
    if (!productos.length) return [];
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Se le preguntó al cliente para qué uso necesita cada uno de estos productos, en este orden:\n' +
              productos.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\n' +
              'El cliente puede responder todo junto (ej: "1. repostería 2. ambiental"), en el mismo orden sin ' +
              'numerar (ej: "repostería y ambiental"), o mencionar solo algunos. ' +
              'Responde SOLO JSON válido: {"usos": [string|null, ...]} con exactamente ' + productos.length +
              ' elementos, en el mismo orden que la lista — null en la posición de cualquier producto cuyo uso ' +
              'no puedas determinar con la respuesta del cliente.',
          },
          { role: 'user', content: respuesta },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 300,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return productos.map(() => null);
      const parsed = JSON.parse(content);
      const usos = Array.isArray(parsed.usos) ? parsed.usos : [];
      return productos.map((_, i) => (typeof usos[i] === 'string' && usos[i].trim() ? usos[i].trim() : null));
    } catch (err) {
      this.logger.error(`extraerUsosPorProducto error: ${err.message}`);
      return productos.map(() => null);
    }
  }

  /**
   * Igual que extraerUsosPorProducto pero para cantidades — cuando hay que preguntar
   * la cantidad de varios productos ya identificados a la vez. Entiende "cantidad
   * mínima"/"al por mayor" como 0, igual que analizarLoteProductos.
   */
  async extraerCantidadesPorProducto(
    productos: { nombre: string; siglas_unidad: string; nombre_unidad: string }[],
    respuesta: string,
  ): Promise<(number | null)[]> {
    if (!productos.length) return [];
    try {
      const listaProductos = productos
        .map((p, i) => `${i + 1}. ${p.nombre} (unidad de venta: ${p.nombre_unidad} / ${p.siglas_unidad})`)
        .join('\n');
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Se le preguntó al cliente la cantidad que necesita de cada uno de estos productos, en este orden ' +
              '(con su unidad de venta real entre paréntesis):\n' +
              listaProductos + '\n\n' +
              'El cliente puede responder todo junto (ej: "1. 10kg 2. cantidad mínima"), en el mismo orden sin ' +
              'numerar (ej: "10kg y 5 litros"), o mencionar solo algunos, y puede usar una unidad DISTINTA a la ' +
              'unidad de venta del producto (ej: gramos, mililitros, toneladas, libras) — debes CONVERTIR el valor ' +
              'a la unidad de venta real de cada producto:\n' +
              '   - Equivalencias de masa: 1000 mg = 1 g, 1000 g = 1 kg, 1 tonelada = 1000 kg, 1 libra (lb) = 0.453592 kg.\n' +
              '   - Si el producto es una FRAGANCIA o ESENCIA (por su nombre) y el cliente da la cantidad en ' +
              'mililitros (ml), trátalo como gramos (densidad ≈ 1, 1ml = 1g) y luego conviértelo a la unidad de ' +
              'venta. Ejemplo: "10ml" de una fragancia cuya unidad de venta es KG → 0.010.\n' +
              '   - Si el cliente no menciona unidad, asume que el número ya está en la unidad de venta del producto.\n' +
              '   - Si el producto se vende por UNIDADES y el cliente da un conteo simple (ej: "5", "5 unidades"), ' +
              'no apliques conversión de masa — usa el número tal cual.\n' +
              'Cada cantidad, YA CONVERTIDA a la unidad de venta del producto: número si viene explícita. ' +
              '0 si pide cantidad mínima o compra al por mayor/mayorista sin cifra concreta. ' +
              'null si no se puede determinar o convertir con certeza la cantidad de ese producto. ' +
              'Responde SOLO JSON válido: {"cantidades": [number|null, ...]} con exactamente ' + productos.length +
              ' elementos, en el mismo orden que la lista.',
          },
          { role: 'user', content: respuesta },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return productos.map(() => null);
      const parsed = JSON.parse(content);
      const cantidades = Array.isArray(parsed.cantidades) ? parsed.cantidades : [];
      return productos.map((_, i) => {
        const c = cantidades[i];
        return (c === null || c === undefined || isNaN(Number(c))) ? null : Number(c);
      });
    } catch (err) {
      this.logger.error(`extraerCantidadesPorProducto error: ${err.message}`);
      return productos.map(() => null);
    }
  }

  /**
   * Interpreta una modificación en lenguaje libre sobre la lista de productos ya
   * armada (ej: "quita el 2", "cambia el karité a 2kg", "quita el alcanfor y agrega
   * 5kg de cera de soya"). Devuelve las operaciones a aplicar sobre la lista, con
   * índices 1-based referidos al orden mostrado al cliente. Las cantidades nuevas se
   * convierten a la unidad de venta real del producto (mismas reglas que
   * extraerCantidadesPorProducto). Si no se reconoce ninguna operación, devuelve todo
   * vacío — el llamador debe volver a preguntar en vez de adivinar.
   */
  async analizarModificacionLista(
    productos: { nombre: string; cantidad: number; siglas_unidad?: string; nombre_unidad?: string }[],
    respuesta: string,
  ): Promise<{ quitar: number[]; cambiar: { indice: number; cantidad: number }[]; agregar: string | null }> {
    const vacio = { quitar: [] as number[], cambiar: [] as { indice: number; cantidad: number }[], agregar: null as string | null };
    if (!productos.length) return vacio;
    try {
      const lista = productos
        .map((p, i) => {
          const cant = p.cantidad === 0 ? 'cantidad mínima' : `${p.cantidad} ${p.siglas_unidad || ''}`.trim();
          const unidad = p.nombre_unidad || p.siglas_unidad ? ` (unidad de venta: ${p.nombre_unidad || ''} / ${p.siglas_unidad || ''})` : '';
          return `${i + 1}. ${p.nombre} — ${cant}${unidad}`;
        })
        .join('\n');
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'El cliente está editando su lista de productos para cotizar. Lista actual (numerada, con la ' +
              'cantidad actual y la unidad de venta real de cada producto):\n' +
              lista + '\n\n' +
              'Analiza el mensaje del cliente y extrae las operaciones que pide. Puede referirse a los productos ' +
              'por número o por nombre (aproximado, con errores de tipeo). Operaciones posibles:\n' +
              '- QUITAR productos de la lista.\n' +
              '- CAMBIAR la cantidad de productos que YA están en la lista. Si el cliente usa una unidad distinta ' +
              'a la unidad de venta, CONVIERTE el valor: 1000 mg = 1 g, 1000 g = 1 kg, 1 tonelada = 1000 kg, ' +
              '1 libra (lb) = 0.453592 kg. Si el producto es una FRAGANCIA o ESENCIA (por su nombre) y el cliente ' +
              'da mililitros (ml), trátalos como gramos (1ml = 1g) y convierte a la unidad de venta. Si no menciona ' +
              'unidad, asume que ya está en la unidad de venta. Cantidad 0 = pide cantidad mínima.\n' +
              '- AGREGAR productos NUEVOS que no están en la lista: copia el texto del cliente que los describe ' +
              '(producto y cantidad tal como los escribió), sin inventar nada.\n' +
              'Si el mensaje no pide ninguna de estas operaciones con claridad, devuelve todo vacío — NO adivines.\n' +
              'Responde SOLO JSON válido: {"quitar": [números de la lista], ' +
              '"cambiar": [{"indice": número de la lista, "cantidad": número ya convertido}], ' +
              '"agregar": "texto de productos nuevos" o null}',
          },
          { role: 'user', content: respuesta },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 300,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return vacio;
      const parsed = JSON.parse(content);
      const enRango = (n: any) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= productos.length;
      const quitar = (Array.isArray(parsed.quitar) ? parsed.quitar : [])
        .filter(enRango).map(Number);
      const cambiar = (Array.isArray(parsed.cambiar) ? parsed.cambiar : [])
        .filter((c: any) => c && enRango(c.indice) && c.cantidad !== null && c.cantidad !== undefined && !isNaN(Number(c.cantidad)) && Number(c.cantidad) >= 0)
        .map((c: any) => ({ indice: Number(c.indice), cantidad: Number(c.cantidad) }));
      const agregar = typeof parsed.agregar === 'string' && parsed.agregar.trim() ? parsed.agregar.trim() : null;
      return { quitar, cambiar, agregar };
    } catch (err) {
      this.logger.error(`analizarModificacionLista error: ${err.message}`);
      return vacio;
    }
  }

}
