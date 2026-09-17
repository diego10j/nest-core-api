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
              + 'PRODUCTO = disponibilidad, precio, compra, o pedir INFORMACIÓN/DETALLES de un producto específico — '
              + 'nombrar el producto puntual ya alcanza, no hace falta que pida precio o quiera comprar explícitamente '
              + '(ej. "me ayuda con información sobre el ácido peracético" es PRODUCTO, no un saludo genérico). '
              + 'NO incluye preguntas sobre sucursales.\n'
              + 'GENERAL = saludos u otras consultas que NO nombran ningún producto puntual.\n'
              + 'Ejemplos: "tienen sucursal en Cuenca"→UBICACION | "envían a Guayaquil"→ENVIO | "tienen cera de palma"→PRODUCTO | '
              + '"cuál es el precio del sorbitol"→PRODUCTO | "me ayuda con información sobre el ácido peracético"→PRODUCTO | '
              + '"me pasas la lista de precios"→CATALOGO | "qué horario tienen"→HORARIO.\n'
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
   * A diferencia de clasificarConsulta (una sola categoría, la primera que matchea),
   * detecta TODAS las categorías presentes en el texto — el modo mensajes reducidos junta
   * con debounce varios mensajes seguidos del cliente antes de responder (ej. "¿dónde
   * están ubicados?" + "¿tienen catálogo?" + "disponen de percarbonato de sodio?" en un
   * solo lote) justamente para que el bot pueda atender todo junto en la menor cantidad
   * de mensajes, no solo lo primero que detecte. Categorías no excluyentes entre sí.
   */
  async detectarRequerimientos(texto: string): Promise<{
    ubicacion: boolean; horario: boolean; envio: boolean; catalogo: boolean; producto: boolean;
  }> {
    const t = texto.toUpperCase();
    const requerimientos = {
      ubicacion: /UBICACI[OÓ]N|DIRECCI[OÓ]N|D[OÓ]NDE EST[AÁ]N|COMO LLEGAR|MAPA|VALLE|CHILLOS|ESTADIO|SUCURSAL|SEDE|PUNTO\s*DE\s*VENTA/.test(t),
      horario: /HORARIO|QU[EÉ] HORA|ABREN|CIERRAN|ATIENDEN|LUNES|VIERNES|S[AÁ]BADO/.test(t),
      envio: /ENV[IÍ]O|ENV[IÍ]AN|DESPACHO|TRANSPORTE|DELIVER|NACIONAL|OTRA CIUDAD/.test(t),
      catalogo: /CAT[AÁ]LOGO|LISTA DE PRECIOS|PRECIOS\b|LISTA DE PRODUCTO/.test(t),
      producto: /PRODUCTO|COTIZACI[OÓ]N|COTIZAR|COMPRAR|NECESITO|QUIERO|PEDIR|ORDEN|DISPONE[N]?|HAY\s+|DISPONIB|CONSIGO|VENDEN?|EXISTENCIA|STOCK|PRECIO\b|CU[AÁ]NTO\s+CUESTA|COSTO\s+DE/.test(t),
    };
    // Los atajos por regex ya cubren la mayoría de los casos reales sin gastar una
    // llamada a GPT — si ninguno matcheó, el texto es más implícito/conversacional y se
    // le pide a GPT que decida (puede marcar varias categorías igual).
    if (Object.values(requerimientos).some(Boolean)) return requerimientos;

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'El cliente puede estar pidiendo VARIAS cosas en el mismo mensaje (a veces son varios mensajes seguidos ' +
              'que ya vienen unidos, separados por saltos de línea). Marca TRUE cada categoría que aplique — pueden ser ' +
              'varias a la vez, no elijas solo una:\n' +
              'ubicacion = dirección, cómo llegar, sucursal/sede/local en otra ciudad.\n' +
              'horario = horario de atención, si están abiertos.\n' +
              'envio = política GENERAL de envíos (si envían a tal ciudad, costo/tiempo aproximado) — NO marques esto ' +
              'para el seguimiento/estado de un pedido o guía YA ENVIADA en particular (ej. "me ayuda con mi guía", ' +
              '"cómo va mi pedido", "no me ha llegado"): eso depende de datos de UN pedido puntual que este asistente ' +
              'no puede consultar, así que ninguna categoría debe marcarse TRUE ahí — que quede sin clasificar para ' +
              'que se derive a un asesor en vez de responder con la política general.\n' +
              'catalogo = pide el catálogo o la lista de precios EN GENERAL, sin nombrar un producto específico.\n' +
              'producto = disponibilidad, precio, compra, o pedir INFORMACIÓN/DETALLES de un producto específico — ' +
              'nombrar el producto puntual ya alcanza, no hace falta que pida precio o quiera comprar explícitamente ' +
              '(ej. "me ayuda con información sobre el ácido peracético" cuenta como producto=true).\n' +
              'Responde SOLO JSON: {"ubicacion":bool,"horario":bool,"envio":bool,"catalogo":bool,"producto":bool}.',
          },
          { role: 'user', content: texto },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 60,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return requerimientos;
      const parsed = JSON.parse(content);
      return {
        ubicacion: !!parsed.ubicacion,
        horario: !!parsed.horario,
        envio: !!parsed.envio,
        catalogo: !!parsed.catalogo,
        producto: !!parsed.producto,
      };
    } catch (err) {
      this.logger.error(`detectarRequerimientos error: ${err.message}`);
      return requerimientos;
    }
  }

  /**
   * Analiza el texto acumulado durante la captura de productos en lote.
   * Detecta si el cliente ya terminó de listar (FIN literal o cierre semántico)
   * y extrae todos los pares producto/cantidad mencionados hasta el momento.
   */
  async analizarLoteProductos(
    textoAcumulado: string,
    productosYaAgregados: string[] = [],
    historialReciente: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<{
    completo: boolean;
    items: { producto: string; cantidad: number | null; cantidadTexto?: string | null }[];
  }> {
    const ctx = productosYaAgregados.length
      ? `Ya fueron agregados a la cotización (no los repitas): ${productosYaAgregados.join(', ')}.`
      : '';
    // Sin historial, un mensaje de seguimiento que no repite el producto (ej. el cliente
    // preguntó "tienen cera de coco", el bot respondió, y el cliente solo contesta
    // "necesito 2kg") se analiza aislado y no encuentra ningún producto — la cotización
    // terminaba con un ítem genérico en vez de "cera de coco" (caso real detectado
    // 2026-09-13). Con el historial, GPT puede resolver la referencia al mensaje anterior
    // como lo haría un asesor leyendo el chat completo. OJO: esto es solo para RESOLVER A
    // QUÉ producto se refiere el último mensaje cuando no lo nombra — el historial NO debe
    // hacer que se re-listen productos de mensajes anteriores que el cliente ya no está
    // mencionando ahora, o la lista de "items" crece sola en cada respuesta (caso real
    // detectado 2026-09-16: el cliente preguntó por cera de soya, luego por fragancias,
    // luego por colorantes, uno a la vez, y cada respuesta del bot repetía TODOS los
    // productos anteriores en vez de solo el nuevo, porque GPT trataba la conversación
    // completa como si fuera un único pedido en construcción).
    const avisoHistorial = historialReciente.length
      ? '\nSi el ÚLTIMO mensaje del cliente (el que aparece más abajo) no nombra ningún producto por sí solo ' +
        '(ej. solo da una cantidad, o responde "sí"/"ese mismo"/"el primero"), revisa los mensajes anteriores de esta ' +
        'misma conversación SOLO para identificar de qué producto está hablando — no lo dejes vacío si el contexto ya ' +
        'lo dejó claro. Pero si el ÚLTIMO mensaje SÍ nombra su(s) propio(s) producto(s) (aunque sea uno nuevo y distinto ' +
        'a los de mensajes anteriores), "items" debe traer SOLO esos — NO agregues de vuelta productos de mensajes ' +
        'anteriores que el cliente ya no está mencionando en este mensaje puntual.\n'
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
              `${ctx}${avisoHistorial}\n` +
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
              '   - Si el cliente da la cantidad en VOLUMEN (litros, galones, ml) para un producto que se vende en KG, ' +
              'NO calcules densidad — normalizá el volumen a LITROS (1000 ml = 1 litro, 1 galón = 4 litros, valor ' +
              'comercial redondeado que usa la empresa) y usá ESE número de litros directo como si fueran kilogramos, ' +
              'sin ninguna conversión adicional. Ejemplos: "20 litros de glicerina"→cantidad:20 | "5 galones"→cantidad:20 | ' +
              '"500 ml"→cantidad:0.5.\n' +
              '   - CANECA: si el cliente da la cantidad en CANECAS (ej: "6 canecas", "1 caneca"), una caneca pesa ' +
              'por lo general 25kg — multiplicá el número de canecas x 25 y usa ese resultado como cantidad en kg ' +
              '(ej: "6 canecas"→cantidad:150, "1 caneca"→cantidad:25). Es un valor aproximado que el asesor puede ' +
              'ajustar después, pero permite avanzar la cotización en vez de dejarla en null.\n' +
              '   - Si el cliente da un conteo simple sin unidad de peso (ej: "5 moldes", "3 unidades", "media docena"→6, ' +
              '"un par"→2), NO apliques conversión de peso — usa el número/conteo tal cual (puede tratarse de un producto que ' +
              'se vende por unidad, no por peso).\n' +
              '   - Si no menciona ninguna cantidad para ese producto: cantidad: null. Esto incluye cuando el cliente solo dice que ' +
              'es "distribuidor"/"mayorista"/pregunta "precios para distribuidor" o "al por mayor" SIN dar una cifra concreta por ' +
              'producto — eso indica el TIPO de precio que busca (tarifa de distribuidor), no la cantidad; una cotización real ' +
              'necesita la cantidad de cada producto, así que se pregunta igual, no se asume nada.\n' +
              '   - cantidad: 0 SOLO si el cliente pide explícitamente la cantidad MÍNIMA disponible de un producto puntual ' +
              '("cantidad mínima", "lo mínimo que manejen", "el mínimo") — el asesor define la cantidad real después, se usa 0 ' +
              'como marcador. No uses 0 solo porque mencionó ser mayorista/distribuidor sin más contexto (ver punto anterior).\n' +
              '   - cantidad: 0 TAMBIÉN si el cliente da la cantidad en un ENVASE/EMPAQUE coloquial (que NO sea caneca, ' +
              'ver regla de arriba) SIN volumen/peso explícito (ej: "2 sacos", "un bulto", "un tanque", "un frasco", ' +
              '"un tambor" — con o sin número, litros/galones/ml NO cuentan acá, esos ya se resuelven con la regla de ' +
              'arriba) — el tamaño real de esos envases varía por producto, no lo adivines. NO uses null en este caso: ' +
              'el cliente SÍ contestó algo válido, null hace que el bot vuelva a preguntar lo mismo sin salida — el ' +
              'asesor confirma la equivalencia exacta después, igual que con "cantidad mínima".\n' +
              '   - Si el cliente menciona VARIANTES o presentaciones distintas de un mismo producto conectadas por "y" (ej. códigos/siglas ' +
              'como APF, BPF, tipo A, tipo B, u otras presentaciones), trátalas como PRODUCTOS SEPARADOS, uno por variante — NO las combines ' +
              'en un solo string. Ejemplo: "cera de soya de APF y BPF" → dos ítems: "cera de soya APF" y "cera de soya BPF".\n' +
              '   - Si el mensaje da una cantidad/unidad pero NO nombra ningún producto concreto (ej. "cotización de 100 litros", ' +
              '"necesito 50kg", "quiero cotizar 20 unidades"), NO inventes ni asumas qué producto es (ni uses "cotización"/"pedido"/' +
              'similar como si fuera el nombre) — usa "producto": "" (string vacío) para ese ítem, mantén la cantidad tal como la dio ' +
              'el cliente, para que el asesor virtual pueda preguntarle puntualmente de qué producto se trata citando lo que ya dijo, ' +
              'sin perderlo.\n' +
              '   - "cantidadTexto": para TODO ítem con cantidad (tenga o no nombre de producto), agregá también el texto EXACTO ' +
              'que el cliente usó para expresar esa cantidad, tal cual lo escribió (ej. "6 canecas", "1 galón", "100 litros", "50kg") ' +
              '— se usa para mostrárselo de vuelta en el resumen de su cotización, en vez del número ya convertido internamente. ' +
              'null si no dio cantidad para ese ítem.\n' +
              'Responde SOLO JSON válido: {"completo": bool, "items":[{"producto":"nombre del producto","cantidad": number|null,' +
              '"cantidadTexto": string|null}]}. No incluyas la palabra FIN ni frases de cierre como si fueran un producto.',
          },
          ...historialReciente.slice(-6),
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
          // Se conserva el ítem si tiene nombre de producto O cantidad — un "producto": ""
          // con cantidad (ver instrucción arriba) es válido: representa "el cliente dio
          // cantidad pero no dijo qué producto", que el llamador debe preguntar puntualmente
          // en vez de perder esa cantidad. Solo se descarta si no aporta NADA (ni nombre ni cantidad).
          .filter((i: any) => i && typeof i.producto === 'string'
            && (i.producto.trim() || (i.cantidad !== null && i.cantidad !== undefined && !isNaN(Number(i.cantidad)))))
          .map((i: any) => ({
            producto: i.producto.trim(),
            cantidad: (i.cantidad === null || i.cantidad === undefined || isNaN(Number(i.cantidad)))
              ? null
              : Number(i.cantidad),
            cantidadTexto: typeof i.cantidadTexto === 'string' && i.cantidadTexto.trim() ? i.cantidadTexto.trim() : null,
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
              'OJO: si el mensaje NO describe ningún uso/aplicación real — es una pregunta sobre otra cosa (ej. ' +
              '"en qué cantidades se vende y el precio", "cuál es el precio") o no tiene relación con para qué va a ' +
              'usar el producto — NO inventes un uso a partir de esa pregunta: dejalo en null. Es mejor volver a ' +
              'preguntar que registrar un uso que en realidad no dijo (caso real detectado 2026-09-17: "quiero saber ' +
              'en qué cantidades la venden" se tomó como si fuera la respuesta de uso).\n' +
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
  ): Promise<{ cantidad: number | null; cantidadTexto?: string | null }[]> {
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
              '   - Si el cliente responde con UNA sola cantidad/expresión de cantidad y NO menciona ningún ' +
              'producto por nombre (ej. le preguntaste por "Ethylene Glycol, Propylene Glycol" y contesta solo ' +
              '"6 canecas" o "20kg"), es la respuesta natural a "cuánto necesitas de CADA UNO" — no hace falta que ' +
              'repita el nombre de cada producto uno por uno. Aplicá esa misma cantidad (ya convertida según las ' +
              'reglas de abajo) a TODOS los productos de la lista. NO la dejes en null solo porque no nombró los ' +
              'productos explícitamente — null en este caso también deja al bot preguntando lo mismo sin salida. ' +
              'OJO: esta regla es SOLO para una expresión que sí describe una cantidad/envase (número, "cantidad ' +
              'mínima", un envase coloquial, etc.) — si el mensaje NO tiene relación alguna con una cantidad (ej. es ' +
              'un nombre de persona/empresa, una pregunta sobre otro tema, un saludo), NO le fuerces un valor a los ' +
              'productos: ahí sí dejalos en null, es la única forma de que el bot vuelva a preguntar en vez de ' +
              'inventar que "cantidad mínima" fue la respuesta (caso real detectado 2026-09-16: el cliente escribió ' +
              'su nombre, "MICHELLE MOLINA", y se interpretó como si fuera la cantidad de dos productos).\n' +
              '   - Equivalencias de masa: 1000 mg = 1 g, 1000 g = 1 kg, 1 tonelada = 1000 kg, 1 libra (lb) = 0.453592 kg.\n' +
              '   - Si el producto es una FRAGANCIA o ESENCIA (por su nombre) y el cliente da la cantidad en ' +
              'mililitros (ml), trátalo como gramos (densidad ≈ 1, 1ml = 1g) y luego conviértelo a la unidad de ' +
              'venta. Ejemplo: "10ml" de una fragancia cuya unidad de venta es KG → 0.010.\n' +
              '   - Si el cliente da la cantidad en VOLUMEN (litros, galones, ml) para un producto cuya unidad de ' +
              'venta es de PESO (kg), NO calcules densidad — normalizá el volumen a LITROS (1000 ml = 1 litro, ' +
              '1 galón = 4 litros, valor comercial redondeado que usa la empresa) y usá ESE número de litros directo ' +
              'como si fueran kilogramos, sin ninguna conversión adicional. Ejemplos: "20 litros"→cantidad:20 | ' +
              '"5 galones"→cantidad:20 | "500 ml"→cantidad:0.5.\n' +
              '   - Si el cliente no menciona unidad, asume que el número ya está en la unidad de venta del producto.\n' +
              '   - Si el producto se vende por UNIDADES y el cliente da un conteo simple (ej: "5", "5 unidades"), ' +
              'no apliques conversión de masa — usa el número tal cual.\n' +
              '   - CANECA: si el cliente da la cantidad en CANECAS (ej: "6 canecas", "1 caneca"), una caneca pesa ' +
              'por lo general 25kg — multiplicá el número de canecas x 25 y usa ese resultado como cantidad en kg ' +
              '(ej: "6 canecas"→cantidad:150, "1 caneca"→cantidad:25). Es un valor aproximado que el asesor puede ' +
              'ajustar después, pero permite avanzar la cotización en vez de dejarla en null.\n' +
              '   - Si el cliente da la cantidad en OTRO ENVASE/EMPAQUE coloquial SIN volumen/peso explícito ' +
              '(ej: "2 sacos", "un bulto", "un tanque", "un frasco", "un tambor" — con o sin número, litros/galones/ml ' +
              'NO cuentan acá, esos ya se resuelven con la regla de arriba), NO intentes adivinar cuántos kg es — el ' +
              'tamaño real de esos envases varía por producto y no lo sabés con certeza. Tratalo IGUAL que "cantidad ' +
              'mínima": usa 0. NO devuelvas null en este caso — null hace que el bot vuelva a preguntar lo mismo en ' +
              'un loop sin salida, y el cliente YA contestó algo válido, solo que el asesor tiene que confirmar la ' +
              'equivalencia exacta después.\n' +
              '"cantidad": la cantidad YA CONVERTIDA a la unidad de venta del producto: número si viene explícita ' +
              '(incluye volumen normalizado a litros, y canecas convertidas a kg, ver reglas de arriba). ' +
              '0 si pide cantidad mínima, compra al por mayor/mayorista sin cifra concreta, o da un envase/empaque ' +
              'coloquial (que no sea caneca) sin volumen/peso explícito (ver regla de arriba). ' +
              'null SOLO si el cliente mencionó explícitamente OTROS productos con sus cantidades pero dejó ESTE ' +
              'producto puntual sin contestar (ej. respondió "1. 10kg" pero había un producto 2 que no tocó) — no ' +
              'uses null solo porque no repitió el nombre en una respuesta de una sola cantidad para todos (ver ' +
              'regla de arriba). ' +
              '"cantidadTexto": el texto EXACTO que el cliente usó para expresar esa cantidad, tal cual lo escribió ' +
              '(ej. "6 canecas", "1 galón", "20kg", "cantidad mínima") — se usa para mostrárselo de vuelta al cliente ' +
              'en el resumen de su cotización, en vez del número ya convertido internamente. null si ese producto ' +
              'quedó sin contestar.\n' +
              'Responde SOLO JSON válido: {"items": [{"cantidad": number|null, "cantidadTexto": string|null}, ...]} ' +
              'con exactamente ' + productos.length + ' elementos, en el mismo orden que la lista.',
          },
          { role: 'user', content: respuesta },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 300,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return productos.map(() => ({ cantidad: null }));
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      return productos.map((_, i) => {
        const it = items[i];
        const c = it?.cantidad;
        return {
          cantidad: (c === null || c === undefined || isNaN(Number(c))) ? null : Number(c),
          cantidadTexto: typeof it?.cantidadTexto === 'string' && it.cantidadTexto.trim() ? it.cantidadTexto.trim() : null,
        };
      });
    } catch (err) {
      this.logger.error(`extraerCantidadesPorProducto error: ${err.message}`);
      return productos.map(() => ({ cantidad: null }));
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
      const reglaUnico = productos.length === 1
        ? 'Como la lista tiene un único producto, si el cliente menciona SOLO una cantidad (sin número ni ' +
          'nombre de producto), asume que se refiere a ese producto (índice 1).\n'
        : '';
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
              'por número o por nombre (aproximado, con errores de tipeo). ' + reglaUnico +
              'Operaciones posibles:\n' +
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

  // ─── Modo mensajes reducidos ────────────────────────────────────────────────

  /**
   * Igual que generateResponse, pero le pide a GPT que también indique si la consulta
   * necesita un dato específico que no puede responder con certeza (precio exacto, stock
   * real, condición particular de un pedido) — en ese caso "respuesta" es un mensaje breve
   * avisando que se deriva a un asesor, NO un intento de contestar la pregunta original.
   * También detecta interés GENÉRICO en una actividad/manualidad (ej. "quiero aprender a
   * hacer jabones") sin producto puntual — GPT sabe de sobra qué materiales se usan por su
   * conocimiento general, pero eso no es información real de ESTA empresa (puede no
   * coincidir con lo que vende ni con sus nombres de producto) y generaba respuestas
   * inventadas tipo tutorial (caso real detectado 2026-09-15: listó "base de jabón,
   * aceites esenciales, colorantes, moldes..." de memoria, sin que nada de eso viniera del
   * catálogo). En ese caso el llamador debe mostrar el catálogo real y derivar a un asesor,
   * no usar "respuesta" tal cual. Usado solo en modo mensajes reducidos (ATENCION_LIBRE_
   * REDUCIDA) para evitar que el bot invente información cuando no tiene certeza.
   */
  async generateResponseConEscalamiento(
    systemPrompt: string,
    historial: { role: 'user' | 'assistant'; content: string }[],
    mensajeActual: string,
    contextoExtra?: string,
  ): Promise<{ respuesta: string; requiereAsesor: boolean; interesGenerico: boolean }> {
    const sysContent =
      `${systemPrompt}\n\n--- Contexto actual ---\n${contextoExtra ?? ''}\n\n` +
      'REGLA FIJA: si el cliente expresa un interés GENERAL en una actividad o manualidad (ej. "quiero aprender a ' +
      'hacer jabones/velas/cosméticos", "cómo empiezo a hacer velas", "qué necesito para hacer jabón") SIN nombrar ' +
      'un producto puntual de esta empresa, NO expliques con tu propio conocimiento general qué materiales, pasos o ' +
      'productos necesita (aunque lo sepas) — eso no es información real de ESTA empresa, puede no coincidir con lo ' +
      'que vende ni con sus nombres de producto. En ese caso "interesGenerico" debe ser true.\n' +
      'Responde SOLO JSON válido: {"respuesta": "texto para el cliente", "requiereAsesor": bool, "interesGenerico": bool}. ' +
      'requiereAsesor=true SOLO si la pregunta necesita un dato específico que no puedes responder con certeza ' +
      '(precio exacto, stock real, condición particular de un pedido puntual) — en ese caso "respuesta" debe ser ' +
      'un mensaje breve avisando que un asesor se comunicará, sin intentar responder la pregunta original. ' +
      'interesGenerico=true en el caso descrito arriba — no hace falta que armes "respuesta" con cuidado en ese ' +
      'caso, el sistema arma su propio mensaje con el catálogo real de la empresa.';

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
        response_format: { type: 'json_object' },
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return { respuesta: 'Lo siento, tuve un inconveniente. ¿Podrías repetir?', requiereAsesor: false, interesGenerico: false };
      const parsed = JSON.parse(content);
      return {
        respuesta: typeof parsed.respuesta === 'string' && parsed.respuesta.trim()
          ? parsed.respuesta.trim()
          : 'Con gusto te ayudo — un asesor se comunicará contigo.',
        requiereAsesor: !!parsed.requiereAsesor,
        interesGenerico: !!parsed.interesGenerico,
      };
    } catch (err) {
      this.logger.error(`generateResponseConEscalamiento error: ${err.message}`);
      return { respuesta: 'Disculpa, ocurrió un problema procesando tu mensaje. Por favor intenta de nuevo.', requiereAsesor: false, interesGenerico: false };
    }
  }

  /**
   * Determina si el producto que menciona el cliente corresponde a alguno de los
   * catálogos públicos con stock disponible (modo mensajes reducidos) — para dirigirlo
   * directo al catálogo con precios en vez de levantar una solicitud de cotización manual.
   * No adivina: si no hay coincidencia razonablemente clara, devuelve null.
   *
   * `matchEspecifico` distingue el tipo de coincidencia: true cuando el texto del cliente
   * matcheó un producto PUNTUAL listado dentro del catálogo (ej. "cera de coco" → producto
   * exacto), false cuando solo matcheó el tema/título general del catálogo (ej. "esencias
   * para velas" → catálogo "Fragancias para velas", sin un producto puntual identificado).
   * El llamador usa esto para no invitar a "dar la cantidad" cuando el catálogo tiene
   * varios productos y no se sabe cuál puntual quiere el cliente.
   */
  async matchCatalogoProducto(
    texto: string,
    catalogos: { ide_cata: number; nombre_cata: string; descripcion_cata?: string | null; productos: { nombre: string }[] }[],
  ): Promise<{ ide_cata: number; matchEspecifico: boolean } | null> {
    if (!catalogos.length) return null;
    // La descripción del catálogo (desc_corta_inccat/descripcion_inccat) es contexto EXTRA
    // para decidir el match — ej. "cera de soya APF" puede no estar listada como producto
    // puntual, pero si la descripción del catálogo "Ceras" la menciona, ayuda a confirmar
    // que sí corresponde ahí. Esto es solo una señal interna para GPT: la descripción NUNCA
    // se le muestra al cliente (ver obtenerCatalogosDisponibles) — la respuesta se mantiene
    // corta y precisa, solo confirmación + link.
    const listado = catalogos
      .map((c) => {
        const desc = c.descripcion_cata ? ` — descripción: ${c.descripcion_cata}` : '';
        return `Catálogo "${c.nombre_cata}" (id ${c.ide_cata})${desc}. Productos: ${c.productos.map((p) => p.nombre).join(', ')}`;
      })
      .join('\n');

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'El cliente pregunta por un producto. Estos son los catálogos públicos con stock disponible, su ' +
              'descripción (si tiene) y sus productos:\n' + listado + '\n\n' +
              'Si el producto que menciona el cliente coincide (exacto o muy cercano) con alguno de los productos ' +
              'listados, con el tema/título general de un catálogo (ej. "esencias para velas" con el catálogo ' +
              '"Fragancias para velas"), o con lo que describe la descripción del catálogo (ej. la descripción de ' +
              '"Ceras" menciona cera de soya aunque no esté listada como producto puntual), responde SOLO JSON: ' +
              '{"ide_cata": <id del catálogo>, "matchEspecifico": <true|false>}. ' +
              '"matchEspecifico" = true SOLO si el texto coincide con UNO de los productos listados puntualmente; ' +
              'false si solo coincide con el tema/título general del catálogo o con su descripción. Si NO hay ningún ' +
              'catálogo ni producto que coincida con razonable certeza, responde {"ide_cata": null, "matchEspecifico": ' +
              'false} — no adivines ni asumas coincidencias vagas.',
          },
          { role: 'user', content: texto },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 40,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content);
      const ideCata = Number(parsed.ide_cata);
      if (!Number.isInteger(ideCata) || !catalogos.some((c) => c.ide_cata === ideCata)) return null;
      return { ide_cata: ideCata, matchEspecifico: !!parsed.matchEspecifico };
    } catch (err) {
      this.logger.error(`matchCatalogoProducto error: ${err.message}`);
      return null;
    }
  }

  /**
   * Extrae nombre y/o ciudad de la respuesta del cliente cuando se le pidieron en un solo
   * mensaje (modo mensajes reducidos, cotización rápida). Solo pide lo que realmente falta
   * — `pedirNombre`/`pedirCiudad` en false hacen que ese campo se devuelva siempre null
   * sin llamar a GPT si ninguno de los dos hace falta.
   *
   * También devuelve `restoTexto`: lo que queda del mensaje después de quitar el nombre/
   * ciudad extraídos (null si el mensaje era SOLO el nombre/ciudad, sin nada más). Los
   * llamadores que combinan este mensaje con `texto_inicial` para volver a analizarlo
   * (detectar productos, ubicación, etc.) deben usar `restoTexto`, NUNCA el mensaje crudo
   * — si el cliente respondió solo "Laboratorio DOC" a "¿cuál es tu nombre?", reinyectar
   * ese texto crudo en el análisis de productos hacía que GPT lo interpretara como un
   * segundo producto en la lista (caso real detectado 2026-09-15: cotización con
   * "TWEEN DE 20" real + "LABORATORIO DOC" inventado como si fuera otro producto).
   */
  async extraerNombreYCiudad(
    respuesta: string,
    pedirNombre: boolean,
    pedirCiudad: boolean,
  ): Promise<{ nombre: string | null; ciudad: string | null; restoTexto: string | null }> {
    if (!pedirNombre && !pedirCiudad) return { nombre: null, ciudad: null, restoTexto: respuesta };
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'El cliente está respondiendo a una pregunta que le pidió' +
              (pedirNombre && pedirCiudad
                ? ' su nombre y la ciudad desde donde escribe.'
                : pedirNombre
                  ? ' su nombre.'
                  : ' la ciudad desde donde escribe.') +
              (pedirNombre
                ? ' Este es un negocio B2B (venta de materias primas/químicos): "nombre" es válido tanto si da su ' +
                  'nombre de pila (ej. "Diego", "me llamo Ashly") como si responde SOLO con el nombre de su empresa ' +
                  '(ej. "Somos la empresa Botica Bristol", "Química Andina", "represento a Laboratorios XYZ") — en ' +
                  'ese caso usa el nombre de la empresa como "nombre". PERO si el mensaje trae AMBOS (su nombre de ' +
                  'persona Y el de la empresa, ej. "le saluda Lissette Catagua de la cía QUIMPAC ECUADOR S.A."), usa ' +
                  'el NOMBRE DE LA PERSONA como "nombre" — es a quien se saluda, no a la empresa; el nombre de ' +
                  'empresa solo se usa como "nombre" cuando es lo ÚNICO que dio. ' +
                  'OJO: un nombre de empresa NO es lo mismo que el nombre de un PRODUCTO/QUÍMICO (ej. "ácido ' +
                  'sulfónico", "formol", "percarbonato de sodio") ni una PREGUNTA sobre algo (termina en "?", o es ' +
                  'claramente una consulta tipo "tienen tal cosa?"). Si el mensaje es eso — un producto suelto o una ' +
                  'pregunta — NO es una respuesta válida al nombre: "nombre" debe quedar null y ese texto entero va a ' +
                  '"restoTexto", aunque sea corto y parezca a primera vista un nombre de empresa (caso real detectado ' +
                  '2026-09-16: "ACIDO SULFONICO?" — una pregunta sobre otro producto — se tomó como si fuera el ' +
                  'nombre del cliente). '
                : '') +
              (pedirCiudad
                ? ' Si en vez de (o además de) decir el nombre de la ciudad, el cliente da una DIRECCIÓN completa ' +
                  '(calle, número, sector, parque industrial, referencia) — típico de datos de facturación pegados ' +
                  'de otra fuente — INFIERE la ciudad a partir de esa dirección si es reconocible (calles, sectores o ' +
                  'referencias que ubiques en una ciudad de Ecuador), en vez de dejar "ciudad" en null solo porque no ' +
                  'usó el nombre de la ciudad literalmente. Si la dirección no te permite ubicar la ciudad con algo de ' +
                  'confianza, ahí sí null — no adivines al azar. '
                : '') +
              'Extrae SOLO lo que el cliente realmente indicó en su respuesta — no inventes ni asumas. ' +
              'Además, en "restoTexto" devuelve el resto del mensaje SIN el nombre/ciudad ya extraídos (ej. si ' +
              'respondió "Janneth Pachacama quiero la ubicación", nombre="Janneth Pachacama" y restoTexto="quiero ' +
              'la ubicación"). Si el mensaje era ÚNICAMENTE el nombre y/o la ciudad, sin nada más, "restoTexto" es null. ' +
              'Responde SOLO JSON: {"nombre": string|null, "ciudad": string|null, "restoTexto": string|null}.',
          },
          { role: 'user', content: respuesta },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 150,
      });
      const content = resp.choices[0]?.message?.content;
      if (!content) return { nombre: null, ciudad: null, restoTexto: respuesta };
      const parsed = JSON.parse(content);
      return {
        nombre: typeof parsed.nombre === 'string' && parsed.nombre.trim() ? parsed.nombre.trim() : null,
        ciudad: typeof parsed.ciudad === 'string' && parsed.ciudad.trim() ? parsed.ciudad.trim() : null,
        restoTexto: typeof parsed.restoTexto === 'string' && parsed.restoTexto.trim() ? parsed.restoTexto.trim() : null,
      };
    } catch (err) {
      this.logger.error(`extraerNombreYCiudad error: ${err.message}`);
      return { nombre: null, ciudad: null, restoTexto: respuesta };
    }
  }

  /**
   * Detecta si el cliente está molesto/frustrado con la atención (reclamo, queja, tono de
   * enojo) — NO simplemente "no tienen el producto que busca". Usado en modo mensajes
   * reducidos para derivar a un asesor de inmediato en vez de seguir intentando resolverlo
   * con el bot. Atajo rápido sin GPT para los casos más obvios (evita una llamada extra en
   * el caso común de un cliente normal).
   */
  async detectarFrustracion(texto: string): Promise<boolean> {
    if (/\b(p[eé]simo|mal[ií]simo|estafa|denuncia|terrible|nunca\s+m[aá]s|no\s+sirve|inservible|incompeten|de\s+verg[uü]enza)\b/i.test(texto)) {
      return true;
    }
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Analiza si el cliente está molesto, frustrado o enojado con la atención o el servicio — un tono ' +
              'de queja, reclamo o enojo explícito. NO cuenta simplemente estar insatisfecho porque no hay stock ' +
              'de un producto o preguntar algo varias veces. Responde SOLO "SI" o "NO".',
          },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 5,
      });
      return (resp.choices[0]?.message?.content?.trim().toUpperCase().startsWith('SI')) ?? false;
    } catch (err) {
      this.logger.error(`detectarFrustracion error: ${err.message}`);
      return false;
    }
  }

  /**
   * Detecta si el primer mensaje de un chat nuevo es la oferta de un PROVEEDOR (alguien
   * que quiere VENDERnos un producto/servicio) en vez de un cliente que busca comprar.
   * El bot existe para cotizar y captar clientes rápido, no para gestionar ofertas de
   * proveedores — esas se derivan directo a un asesor, sin la fricción del flujo de
   * ventas (saludo, identificación, etc.). Ante la duda responde que NO es proveedor,
   * para no arriesgarse a bloquear a un cliente real.
   */
  async esProveedorNoCliente(texto: string): Promise<boolean> {
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Analiza si este mensaje es de un PROVEEDOR ofreciendo VENDERLE un producto o servicio a la empresa ' +
              '(ej. "tengo a su disposición...", "les ofrezco...", "contamos con... a un precio de remate", ' +
              '"somos representantes de...", "cuento con [producto] por varios sacos, estoy dispuesto a dejarlo a un ' +
              'precio de liquidación") — la clave es que el que ESCRIBE dice tener el producto/stock y busca ' +
              'colocarlo/rematarlo/liquidarlo, aunque no diga literalmente "vendo" u "ofrezco" — y NO un cliente ' +
              'preguntando si LA EMPRESA vende algo. Ante la duda, responde NO (favorece no bloquear a un cliente ' +
              'real). Responde SOLO "SI" o "NO".',
          },
          { role: 'user', content: texto },
        ],
        temperature: 0,
        max_tokens: 5,
      });
      return (resp.choices[0]?.message?.content?.trim().toUpperCase().startsWith('SI')) ?? false;
    } catch (err) {
      this.logger.error(`esProveedorNoCliente error: ${err.message}`);
      return false;
    }
  }

}
