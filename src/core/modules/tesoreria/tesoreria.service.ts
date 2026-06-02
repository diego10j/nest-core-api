import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { OcrService } from 'src/core/integration/ocr/ocr.service';

import { ResultadoOcrTransferenciaDto } from './dto/resultado-ocr-transferencia.dto';

/**
 * Prompt para parsear TEXTO CRUDO extraído por OCR.
 * El OCR ya hizo su trabajo: extraer TODO el texto de la imagen.
 * Ahora GPT analiza ese texto y lo estructura en JSON.
 */
const PARSE_PROMPT = `Eres un analista de comprobantes bancarios. Vas a recibir el TEXTO CRUDO que un OCR extrajo
de la imagen de un comprobante de transferencia. Tu tarea es analizar ese texto y estructurarlo en JSON.

PASO 1 — Determina el tipo de transferencia:
- Es "recibida" si frases como: "Transferencia recibida", "Crédito", "Abono", "Depósito", "Le pagan",
  "Ha recibido", "Pago recibido", "Acreditado", "Nota de crédito".
- Es "enviada" si frases como: "Transferencia enviada", "Débito", "Pago realizado", "Usted pagó",
  "Pago enviado", "Transferencia realizada", "Nota de débito".
- Si el texto no permite determinarlo, asigna null.

PASO 2 — Identifica los DOS ACTORES de la transferencia:
- ACTOR A (ORIGEN / QUIEN ENVÍA / PAGA): la persona o empresa que envía el dinero.
- ACTOR B (DESTINO / QUIEN RECIBE / COBRA): la persona o empresa que recibe el dinero.

PASO 3 — Extrae los siguientes campos:

"tipoTransferencia": "recibida" | "enviada" | null

"valor": number | null
  - Busca el monto principal. Suele estar en grande, en negrita o dentro de un recuadro.
  - Formatos: "$1,255.00", "USD 1,255.00", "$ 1.255,00", "1,255.00", "1255.00".
  - Convierte a número puro: "$1,255.00" → 1255.00, "$ 1.255,00" → 1255.00.
  - Toma el valor que corresponda al monto transferido, no saldos de cuenta.
  - Si hay múltiples montos, elige el más destacado o el etiquetado como "Valor", "Monto", "Importe".

"numeroComprobante": string | null
  - Etiquetas: "Comprobante Nro.", "N° Comprobante", "Nro. Comprobante", "No. Comprobante",
    "N de Comprobante", "Nro de transacción", "N° de comprobante", "Transacción #",
    "Referencia", "Operación No.", "No. Operación", "Número de operación".
  - Extrae SOLO el número, sin la etiqueta. Ej: "Comprobante Nro. 11111111" → "11111111".

"fecha": string | null
  - Etiquetas: "Fecha", "Fecha de transacción", "Fecha de operación", "Fecha y hora".
  - Formatos posibles: "30/05/2026", "30-05-2026", "2026-05-30", "30 de mayo de 2026",
    "30/May/2026", "30 May 2026", "May 30, 2026", "30/05/2026 14:30".
  - Normaliza a YYYY-MM-DD. "30/05/2026" → "2026-05-30".
  - Si solo aparece la fecha del sistema o de emisión y no la de la transferencia, úsalas igual.

"ordenante": string | null
  - DEFINICIÓN: El ACTOR A — QUIEN ENVÍA el dinero. El PAGADOR.
  - En recibida: es el tercero que nos pagó a nosotros.
  - En enviada: somos nosotros (nombre de la empresa o titular de la cuenta de origen).
  - Etiquetas: "Ordenante:", "Remitente:", "De:", "Pagador:", "Emisor:",
    "Quien envía:", "Cliente:", "Comprador:", "A nombre de:" (cuando va junto a cuenta origen).
  - NUNCA confundas con "Beneficiario" o "Para:". Ordenante = quien PAGA, no quien cobra.
  - Limpia la etiqueta. "Ordenante: Juan Pérez" → "Juan Pérez".
  - Si no hay nombre explícito pero hay cuenta origen con titular, usa ese titular.

"cuentaOrigen": string | null
  - DEFINICIÓN: Cuenta DESDE DONDE salió el dinero.
  - Etiquetas: "Cuenta origen:", "Cuenta débito:", "De cuenta:", "Cuenta cargo:",
    "Número de cuenta origen:", "Cuenta de débito:".
  - Puede estar enmascarada: "****5678", "**********1234".
  - Si está enmascarada, devuelve el texto tal cual.

"bancoOrigen": string | null
  - DEFINICIÓN: Banco DESDE DONDE se envió el dinero.
  - Etiquetas: "Banco origen:", "Entidad origen:", "Desde:", "Institución origen:".
  - Bancos comunes: Pichincha, Guayaquil, Pacífico, Produbanco, Bolivariano, Internacional,
    Austro, Machala, Loja, Solidario, entre otros.
  - Devuelve solo el nombre del banco: "Banco Pichincha" → "Banco Pichincha".

"beneficiario": string | null
  - DEFINICIÓN: El ACTOR B — QUIEN RECIBE el dinero. El COBRADOR.
  - En recibida: somos nosotros (nombre de la empresa o titular de la cuenta destino).
  - En enviada: es el tercero a quien le pagamos.
  - Etiquetas: "Beneficiario:", "Para:", "Titular:", "Acreditado a:",
    "A nombre de:" (cuando va junto a cuenta destino), "Proveedor:", "Vendedor:".
  - NUNCA confundas con "Ordenante:" o "De:". Beneficiario = quien COBRA, no quien paga.
  - CUIDADO CON "Para:": puede contener beneficiario, banco destino o cuenta destino.
    Si "Para: Diquimec S.A.S." → beneficiario. Si "Para: Banco Pichincha" → bancoDestino.
    Si "Para: Corriente Nro. 123456" → cuentaDestino.
    Usa el contexto para decidir.
  - Limpia la etiqueta: "Beneficiario: María García" → "María García".

"cuentaDestino": string | null
  - DEFINICIÓN: Cuenta A DONDE llegó el dinero.
  - Etiquetas: "Cuenta destino:", "Cuenta crédito:", "Cuenta beneficiaria:",
    "Número de cuenta:", "Cuenta:", "Acreditado a cuenta:".
  - Puede estar enmascarada: "****8109", "**********8109".
  - También bajo "Para" como "Corriente Nro. 2******284".
  - Si está enmascarada, devuelve el texto tal cual.

"bancoDestino": string | null
  - DEFINICIÓN: Banco A DONDE llegó el dinero.
  - Etiquetas: "Banco destino:", "Banco beneficiario:", "Entidad destino:",
    "Institución destino:", "Banco:", "Entidad financiera:".
  - También puede aparecer bajo "Para" junto a la cuenta destino o beneficiario.
  - Devuelve solo el nombre: "Banco de Guayaquil" → "Banco de Guayaquil".

REGLAS CRÍTICAS:
1. "ordenante" y "beneficiario" son OPUESTOS. Si uno es el pagador, el otro es el cobrador. NUNCA los inviertas.
2. "cuentaOrigen" y "cuentaDestino" son OPUESTAS. De donde sale el dinero vs. a donde llega.
3. "bancoOrigen" y "bancoDestino" son OPUESTOS.
4. El texto puede tener errores de OCR: "0" puede ser "O", "1" puede ser "l", "$" puede ser "5", etc.
   Aplica sentido común para corregir.
5. Si un campo no se encuentra, retorna null. NO inventes datos.
6. Retorna ÚNICAMENTE un objeto JSON con esta estructura:
{
  "tipoTransferencia": string|null,
  "valor": number|null,
  "numeroComprobante": string|null,
  "fecha": string|null,
  "ordenante": string|null,
  "cuentaOrigen": string|null,
  "bancoOrigen": string|null,
  "beneficiario": string|null,
  "cuentaDestino": string|null,
  "bancoDestino": string|null
}
7. No incluyas explicaciones, markdown, ni texto adicional. SOLO el JSON.`;

/**
 * Prompt para GPT-4o Vision — lee la imagen DIRECTAMENTE (sin OCR previo).
 * Se usa como fallback cuando OCR no detecta texto, o a petición del frontend.
 */
const VISION_PROMPT = `Eres un analista de comprobantes bancarios. Estás VIENDO DIRECTAMENTE la imagen de un comprobante
de transferencia (puede ser una foto de celular, un screenshot, o un PDF escaneado).
La imagen puede ser de baja calidad, borrosa o tener mala iluminación. Haz tu mejor esfuerzo.

PASO 1 — Determina el tipo:
- "recibida": "Transferencia recibida", "Crédito", "Abono", "Depósito", "Le pagan", "Ha recibido".
- "enviada": "Transferencia enviada", "Débito", "Pago realizado", "Usted pagó", "Transferencia realizada".
- Si no se puede determinar, null.

PASO 2 — Identifica los DOS ACTORES:
- ACTOR A (ORIGEN / QUIEN ENVÍA / PAGA)
- ACTOR B (DESTINO / QUIEN RECIBE / COBRA)

Extrae en JSON:

"tipoTransferencia": "recibida" | "enviada" | null

"valor": number | null
  - Busca el monto más destacado visualmente (grande, negrita, recuadro).
  - "$1,255.00" → 1255.00, "$ 1.255,00" → 1255.00.

"numeroComprobante": string | null
  - Solo el número. Ignora prefijos como "Comprobante Nro.", "N°", "No.", "Transacción #".

"fecha": string | null
  - Normaliza a YYYY-MM-DD. Cualquier formato de fecha visible.

"ordenante": string | null
  - ACTOR A: QUIEN ENVÍA el dinero. El PAGADOR.
  - Etiquetas: "Ordenante:", "Remitente:", "De:", "Pagador:", "Emisor:".
  - En recibida: el tercero que pagó. En enviada: la empresa/titular origen.

"cuentaOrigen": string | null
  - Cuenta DESDE DONDE salió el dinero. "Cuenta origen:", "Cuenta débito:", "De cuenta:".
  - Si está enmascarada, devuelve el texto con asteriscos tal cual.

"bancoOrigen": string | null
  - Banco DESDE DONDE se envió. "Banco origen:", "Entidad origen:", "Desde:".
  - Solo el nombre: "Banco Pichincha".

"beneficiario": string | null
  - ACTOR B: QUIEN RECIBE el dinero. El COBRADOR.
  - Etiquetas: "Beneficiario:", "Para:" (cuando es nombre/empresa), "Titular:", "Acreditado a:".
  - CUIDADO con "Para:": si es nombre/empresa → beneficiario; si es banco → bancoDestino.
  - En enviada: el tercero que cobra. En recibida: la empresa/titular destino.
  - NUNCA confundir con "Ordenante:". Son OPUESTOS.

"cuentaDestino": string | null
  - Cuenta A DONDE llegó. "Cuenta destino:", "Cuenta crédito:", "Cuenta beneficiaria:".
  - Si está enmascarada, devuelve con asteriscos tal cual.

"bancoDestino": string | null
  - Banco A DONDE llegó. "Banco destino:", "Banco beneficiario:", "Entidad destino:", "Banco:".
  - Solo el nombre: "Banco de Guayaquil".

REGLAS CRÍTICAS:
1. "ordenante" y "beneficiario" son OPUESTOS. NUNCA los inviertas.
2. "cuentaOrigen" y "cuentaDestino" son OPUESTAS.
3. "bancoOrigen" y "bancoDestino" son OPUESTOS.
4. Si la imagen es de baja calidad y un dato no es legible, retorna null para ese campo.
   NO inventes. Es mejor null que un dato falso.
5. Retorna ÚNICAMENTE JSON:
{
  "tipoTransferencia": string|null,
  "valor": number|null,
  "numeroComprobante": string|null,
  "fecha": string|null,
  "ordenante": string|null,
  "cuentaOrigen": string|null,
  "bancoOrigen": string|null,
  "beneficiario": string|null,
  "cuentaDestino": string|null,
  "bancoDestino": string|null
}
6. No incluyas explicaciones. SOLO el JSON.`;

@Injectable()
export class TesoreriaService extends BaseService {
  private readonly logger = new Logger(TesoreriaService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly ocrService: OcrService,
    private readonly gptService: GptService,
  ) {
    super();
  }

  /**
   * Retorna las cuentas bancarias habilitadas para pagos
   * (hace_pagos_tecba = true)
   */
  async getCuentasBancoPagos(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(
      `
      SELECT
        cb.ide_tecba,
        cb.nombre_tecba,
        b.nombre_teban,
        b.foto_teban,
        color_teban
      FROM tes_cuenta_banco cb
      LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
      WHERE cb.hace_pagos_tecba = true
        AND cb.ide_empr = $1
        AND cb.ide_sucu = $2
        AND activo_tecba = true
        AND es_caja_teban = false
      ORDER BY cb.nombre_tecba
      `,
    );
    query.addIntParam(1, dtoIn.ideEmpr);
    query.addIntParam(2, dtoIn.ideSucu);
    return this.dataSource.createSelectQuery(query);
  }

  /**
   * Retorna todas las cuentas bancarias sin filtro de pagos
   */
  async getCuentasBanco(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(
      `
      SELECT
        cb.ide_tecba,
        cb.nombre_tecba,
        b.nombre_teban,
        b.foto_teban,
        color_teban
      FROM tes_cuenta_banco cb
      LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
      WHERE cb.ide_empr = $1
        AND cb.ide_sucu = $2
        AND activo_tecba = true
        AND es_caja_teban = false
      ORDER BY cb.nombre_tecba
      `,
    );
    query.addIntParam(1, dtoIn.ideEmpr);
    query.addIntParam(2, dtoIn.ideSucu);
    return this.dataSource.createSelectQuery(query);
  }


  async getCuentasBancoCheques(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(
      `
      SELECT
        cb.ide_tecba,
        cb.nombre_tecba,
        b.nombre_teban,
        b.foto_teban,
        color_teban
      FROM tes_cuenta_banco cb
      LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
      WHERE cb.hace_cheque_tecba = true
        AND cb.ide_empr = $1
        AND cb.ide_sucu = $2
        AND activo_tecba = true
        AND es_caja_teban = false
      ORDER BY cb.nombre_tecba
      `,
    );
    query.addIntParam(1, dtoIn.ideEmpr);
    query.addIntParam(2, dtoIn.ideSucu);
    return this.dataSource.createSelectQuery(query);
  }

  /**
   * Procesa imagen de transferencia: OCR primero, con fallback a GPT-4o Vision.
   */
  async procesarImagenTransferencia(
    imageBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<ResultadoOcrTransferenciaDto & { origen: string }> {
    this.logger.log(`Procesando imagen: ${fileName} (${mimeType})`);

    try {
      const textoExtraido = await this.ocrService.extractTextFromImage(imageBuffer, fileName);

      if (!textoExtraido || textoExtraido.trim().length < 30) {
        this.logger.warn('Texto OCR insuficiente, usando GPT-4o Vision como fallback');
        return this.procesarImagenTransferenciaVision(imageBuffer, mimeType, 'vision_fallback');
      }

      this.logger.log(`Texto OCR extraído (${textoExtraido.length} caracteres)`);

      const resultado = await this.gptService.parseTextToJson(PARSE_PROMPT, textoExtraido);

      return {
        tipoTransferencia: resultado.tipoTransferencia ?? null,
        valor: resultado.valor ?? null,
        numeroComprobante: resultado.numeroComprobante ?? null,
        fecha: resultado.fecha ?? null,
        ordenante: resultado.ordenante ?? null,
        cuentaOrigen: resultado.cuentaOrigen ?? null,
        bancoOrigen: resultado.bancoOrigen ?? null,
        beneficiario: resultado.beneficiario ?? null,
        cuentaDestino: resultado.cuentaDestino ?? null,
        bancoDestino: resultado.bancoDestino ?? null,
        textoOriginal: textoExtraido,
        origen: 'ocr',
      };
    } catch (error) {
      this.logger.warn(`OCR falló, usando GPT-4o Vision como fallback: ${error.message}`);
      return this.procesarImagenTransferenciaVision(imageBuffer, mimeType, 'vision_fallback');
    }
  }

  /**
   * Procesa imagen directamente con GPT-4o Vision (sin OCR).
   * Más preciso pero más costoso. Ideal para frontend cuando el OCR no dio buen resultado.
   */
  async procesarImagenTransferenciaVision(
    imageBuffer: Buffer,
    mimeType: string,
    origen: string = 'vision_direct',
  ): Promise<ResultadoOcrTransferenciaDto & { origen: string }> {
    this.logger.log(`Procesando imagen con GPT-4o Vision (${mimeType})`);

    const resultado = await this.gptService.parseImageToJson(VISION_PROMPT, imageBuffer, mimeType);

    return {
      tipoTransferencia: resultado.tipoTransferencia ?? null,
      valor: resultado.valor ?? null,
      numeroComprobante: resultado.numeroComprobante ?? null,
      fecha: resultado.fecha ?? null,
      ordenante: resultado.ordenante ?? null,
      cuentaOrigen: resultado.cuentaOrigen ?? null,
      bancoOrigen: resultado.bancoOrigen ?? null,
      beneficiario: resultado.beneficiario ?? null,
      cuentaDestino: resultado.cuentaDestino ?? null,
      bancoDestino: resultado.bancoDestino ?? null,
      textoOriginal: null,
      origen,
    };
  }
}
