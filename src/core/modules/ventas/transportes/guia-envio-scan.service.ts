import fs from 'node:fs';
import path from 'node:path';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { OcrService } from 'src/core/integration/ocr/ocr.service';
import { v4 as uuid } from 'uuid';

import { EscanearGuiaEnvioDto, RotarImagenEnvioDto } from './dto/save-transporte.dto';

const IMAGENES_ENVIOS_DIR = path.join(envs.pathDrive, 'ventas', 'envios');

/** Datos leídos de una guía de transporte. Todos opcionales: el usuario revisa y decide cuáles
 * aplica en Completar Envío (nada se guarda automáticamente). */
export interface DatosGuiaEnvio {
    destinatario: string | null;
    /** YYYY-MM-DD */
    fechaEnvio: string | null;
    baseImponible: number | null;
    iva: number | null;
    total: number | null;
    /** Identificador del envío según la transportista (N° de guía, orden de trabajo, tracking...). */
    numeroDocumento: string | null;
    /** Etiqueta con la que aparece ese número: "Guía", "Orden de trabajo", "Tracking", etc. */
    tipoDocumento: string | null;
}

export type OrigenEscaneoGuia = 'ocr' | 'vision_fallback' | 'vision_direct';

// Lado mayor de la imagen escaneada: suficiente para leer letra pequeña de una guía impresa sin
// generar archivos pesados. Las imágenes chicas se agrandan como máximo x2 (más no aporta nitidez).
const LADO_MAX_ESCANEO = 2400;
const FACTOR_MAX_AMPLIACION = 2;
// Tamaño de bloque para estimar el brillo del papel (fondo) - bastante más grande que el grosor
// de un trazo de texto, para que el máximo de cada bloque caiga siempre sobre papel.
const BLOQUE_FONDO = 24;
// Relación píxel/fondo a partir de la cual se considera papel (blanco puro) y por debajo de la
// cual tinta (negro puro). Entre ambos se estira el contraste.
const UMBRAL_PAPEL = 0.88;
const UMBRAL_TINTA = 0.35;
const MARGEN_BLANCO_PX = 24;
// OCR.space (plan gratuito) rechaza archivos de más de 1 MB.
const OCR_MAX_BYTES = 1_000_000;
const OCR_MIN_CARACTERES = 40;

const DESCRIPCION_CAMPOS = `
Campos a extraer (usa null si el dato no aparece o no se lee con certeza razonable):
- "destinatario": NOMBRE COMPLETO de la persona o empresa que RECIBE el paquete (aparece como
  "Destinatario", "Consignatario", "Para", "Recibe", "Cliente destino"). Solo el nombre: sin
  cédula, RUC, teléfono ni dirección. NUNCA el remitente (quien envía).
- "fechaEnvio": fecha de emisión / envío / admisión de la guía, en formato "YYYY-MM-DD". Las
  fechas en Ecuador se escriben con el DÍA primero (dd/mm/aaaa).
- "baseImponible": subtotal del flete ANTES de IVA ("Subtotal", "Base imponible", "Valor
  flete", "Subtotal 15%"). Si hay flete + seguro + otros cargos desglosados, es su subtotal.
- "iva": valor del IVA.
- "total": valor total cobrado por el envío ("Total", "Valor a pagar", "Total a cobrar").
  Montos como número con punto decimal, sin símbolo de moneda (la coma también puede ser el
  separador decimal: "12,50" = 12.5).
- "numeroDocumento": número que identifica el envío en la transportista. Según la empresa se
  rotula distinto: "Guía", "N° de guía", "Número de guía", "Tracking", "Orden de trabajo",
  "O.T.", "OT", "Orden de servicio", "N° de envío", "Encomienda N°", "Boleto", "Ticket",
  "Control N°". Prioridad si hay varios: guía/tracking > orden de trabajo/servicio >
  envío/encomienda > boleto/ticket. NO es: RUC, cédula, teléfono, código postal, número de
  factura, número de autorización ni clave de acceso del SRI. Copia el número tal cual (con
  guiones/letras si los tiene).
- "tipoDocumento": etiqueta corta con la que aparece ese número, normalizada a una de: "Guía",
  "Orden de trabajo", "Orden de servicio", "Tracking", "Envío", "Encomienda", "Boleto",
  "Ticket", o la etiqueta literal si es otra.
Responde SOLO un JSON con la forma exacta:
{"destinatario": string|null, "fechaEnvio": string|null, "baseImponible": number|null,
 "iva": number|null, "total": number|null, "numeroDocumento": string|null,
 "tipoDocumento": string|null}`;

/**
 * Escaneo de guías de transporte para Completar Envío:
 * - `rotar`: gira la foto (tomada de lado) y la guarda como archivo nuevo.
 * - `escanear`: la deja con aspecto de documento escaneado (fondo blanco, tinta negra, sin
 *   sombras ni colores de fondo) y lee sus datos: OCR.space primero y GPT Vision si el texto es
 *   insuficiente o los datos clave no salen / no cuadran (mismo esquema que el escaneo de
 *   comprobantes de pago en TesoreriaService.procesarImagenTransferencia).
 * Solo se conserva la imagen escaneada: la original se borra si ningún envío la usa todavía.
 */
@Injectable()
export class GuiaEnvioScanService {
    private readonly logger = new Logger(GuiaEnvioScanService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly ocrService: OcrService,
        private readonly gptService: GptService,
    ) {}

    // ─── Archivos ─────────────────────────────────────────────────────────────

    private rutaImagen(fileName: string) {
        const filePath = path.join(IMAGENES_ENVIOS_DIR, path.basename(fileName));
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException(`Imagen no encontrada: ${fileName}`);
        }
        return filePath;
    }

    private guardarJpeg(buffer: Buffer) {
        const fileName = `${uuid()}.jpg`;
        fs.writeFileSync(path.join(IMAGENES_ENVIOS_DIR, fileName), buffer);
        return fileName;
    }

    /** Borra una imagen reemplazada (rotada/escaneada) solo si todavía no quedó guardada en
     * ningún envío - si ya está en uso, el reemplazo recién se aplica al guardar el envío y la
     * imagen vieja se sigue necesitando hasta entonces. */
    private async eliminarSiNoEstaEnUso(fileName: string) {
        const enUso = await this.dataSource.pool.query(
            `SELECT 1 FROM cxc_transporte_factura WHERE path_imagen_guia_cctfa = $1 LIMIT 1`,
            [fileName],
        );
        if (enUso.rows.length > 0) return;
        try {
            fs.unlinkSync(path.join(IMAGENES_ENVIOS_DIR, path.basename(fileName)));
        } catch {
            // Ya no existe: nada que limpiar.
        }
    }

    /** Aplica la orientación EXIF de las fotos de celular al archivo recién subido (queda
     * "derecho" para el OCR, el correo y cualquier visor). No toca imágenes sin rotación EXIF. */
    async normalizarOrientacion(filePath: string) {
        try {
            const sharp = (await import('sharp')).default;
            const meta = await sharp(filePath).metadata();
            if (!meta.orientation || meta.orientation === 1) return;
            const buffer = await sharp(filePath).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
            fs.writeFileSync(filePath, buffer);
        } catch (error) {
            this.logger.warn(`No se pudo normalizar la orientación de ${filePath}: ${error}`);
        }
    }

    // ─── Rotar ────────────────────────────────────────────────────────────────

    async rotar(dtoIn: RotarImagenEnvioDto) {
        const sharp = (await import('sharp')).default;
        const filePath = this.rutaImagen(dtoIn.fileName);
        // Primero la orientación EXIF (sharp no la aplica si se pasa un ángulo explícito).
        const derecha = await sharp(filePath).rotate().toBuffer();
        const rotada = await sharp(derecha).rotate(dtoIn.grados).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
        const fileName = this.guardarJpeg(rotada);
        await this.eliminarSiNoEstaEnUso(dtoIn.fileName);
        return { fileName };
    }

    // ─── Escanear ─────────────────────────────────────────────────────────────

    async escanear(dtoIn: EscanearGuiaEnvioDto & HeaderParamsDto) {
        const filePath = this.rutaImagen(dtoIn.fileName);
        const empresa = await this.getNombreEmpresa(dtoIn.ideEmpr);

        // "Análisis avanzado": la imagen ya es la escaneada, solo se vuelve a leer con Vision.
        if (dtoIn.forzarIA) {
            const datos = await this.leerConVision(fs.readFileSync(filePath), empresa);
            return { fileName: dtoIn.fileName, origen: 'vision_direct' as OrigenEscaneoGuia, datos };
        }

        const escaneada = await this.generarEscaneo(fs.readFileSync(filePath));
        const fileName = this.guardarJpeg(escaneada);
        await this.eliminarSiNoEstaEnUso(dtoIn.fileName);

        const { datos, origen } = await this.leerDatos(escaneada, fileName, empresa);
        return { fileName, origen, datos };
    }

    /**
     * Efecto "escáner" (tipo Adobe Scan, modo documento):
     * 1. Orientación EXIF, tamaño de trabajo (reduce fotos enormes, agranda hasta x2 las chicas)
     *    y escala de grises.
     * 2. Estima el brillo del PAPEL en cada zona (máximo por bloques -> suavizado) y divide cada
     *    píxel por él: elimina sombras, iluminación despareja y colores de fondo (papel rosado,
     *    bandas de color, la mesa), que quedan todos en blanco.
     * 3. Estira el contraste: papel -> blanco puro, tinta -> negro, con una curva que mantiene
     *    legibles los trazos finos. Enfoque suave y un margen blanco.
     * No corrige perspectiva (foto en ángulo): eso requiere detectar las esquinas (fase 2).
     */
    private async generarEscaneo(input: Buffer): Promise<Buffer> {
        const sharp = (await import('sharp')).default;

        // El lado mayor es el mismo esté o no rotada la foto por EXIF.
        const meta = await sharp(input).metadata();
        const ladoMayor = Math.max(meta.width ?? 0, meta.height ?? 0) || LADO_MAX_ESCANEO;
        const ladoObjetivo = Math.min(LADO_MAX_ESCANEO, ladoMayor * FACTOR_MAX_AMPLIACION);

        const { data: gris, info } = await sharp(input)
            .rotate()
            .resize({ width: ladoObjetivo, height: ladoObjetivo, fit: 'inside', kernel: 'lanczos3' })
            .toColourspace('b-w')
            .raw()
            .toBuffer({ resolveWithObject: true });
        const { width, height, channels } = info;

        // Fondo: máximo de cada bloque BLOQUE_FONDO x BLOQUE_FONDO (siempre cae en papel).
        const bw = Math.ceil(width / BLOQUE_FONDO);
        const bh = Math.ceil(height / BLOQUE_FONDO);
        const maximos = Buffer.alloc(bw * bh);
        for (let y = 0; y < height; y++) {
            const fila = Math.floor(y / BLOQUE_FONDO) * bw;
            for (let x = 0; x < width; x++) {
                const v = gris[(y * width + x) * channels];
                const idx = fila + Math.floor(x / BLOQUE_FONDO);
                if (v > maximos[idx]) maximos[idx] = v;
            }
        }
        // Mediana: descarta bloques atípicos (un brillo/reflejo aislado); blur: transición suave
        // entre bloques. Luego se lleva al tamaño completo con interpolación.
        const grilla = await sharp(maximos, { raw: { width: bw, height: bh, channels: 1 } })
            .median(3)
            .blur(1.2)
            .toColourspace('b-w')
            .raw()
            .toBuffer({ resolveWithObject: true });
        const fondo = await sharp(grilla.data, { raw: { width: bw, height: bh, channels: grilla.info.channels } })
            .resize(width, height, { kernel: 'cubic', fit: 'fill' })
            .toColourspace('b-w')
            .raw()
            .toBuffer({ resolveWithObject: true });
        const fondoCh = fondo.info.channels;
        const recorte = this.detectarHoja(grilla.data, grilla.info.channels, bw, bh, width, height);

        // Se escribe solo el rectángulo de la hoja (o la imagen completa si no hay recorte).
        const r = recorte ?? { left: 0, top: 0, width, height };
        const salida = Buffer.alloc(r.width * r.height);
        const rango = UMBRAL_PAPEL - UMBRAL_TINTA;
        for (let y = 0; y < r.height; y++) {
            for (let x = 0; x < r.width; x++) {
                const i = (y + r.top) * width + (x + r.left);
                const papel = Math.max(fondo.data[i * fondoCh], 1);
                const relacion = gris[i * channels] / papel;
                let v: number;
                if (relacion >= UMBRAL_PAPEL) {
                    v = 255;
                } else if (relacion <= UMBRAL_TINTA) {
                    v = 0;
                } else {
                    // Curva con gamma > 1: oscurece los medios tonos para que la tinta quede firme.
                    v = Math.round(255 * ((relacion - UMBRAL_TINTA) / rango) ** 1.4);
                }
                salida[y * r.width + x] = v;
            }
        }

        return sharp(salida, { raw: { width: r.width, height: r.height, channels: 1 } })
            .sharpen({ sigma: 0.8 })
            .extend({
                top: MARGEN_BLANCO_PX,
                bottom: MARGEN_BLANCO_PX,
                left: MARGEN_BLANCO_PX,
                right: MARGEN_BLANCO_PX,
                background: { r: 255, g: 255, b: 255 },
            })
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer();
    }

    /**
     * Auto-recorte a la hoja: en la grilla de brillo del papel, los bloques claros son la hoja
     * y los oscuros lo que la rodea (mesa, fondo de la foto). Devuelve el rectángulo que cubre
     * las filas/columnas mayoritariamente claras, metido un bloque hacia adentro para no dejar el
     * borde de la hoja (que tras normalizar quedaría como un marco negro). null = la hoja ya
     * ocupa toda la foto o no se pudo detectar con seguridad (no se recorta).
     */
    private detectarHoja(
        grilla: Buffer,
        ch: number,
        bw: number,
        bh: number,
        width: number,
        height: number,
    ): { left: number; top: number; width: number; height: number } | null {
        const valores = Array.from({ length: bw * bh }, (_, i) => grilla[i * ch]).sort((a, b) => a - b);
        const referencia = valores[Math.floor(valores.length * 0.9)];
        if (!referencia) return null;
        const esPapel = (x: number, y: number) => grilla[(y * bw + x) * ch] >= referencia * 0.6;

        const filas: number[] = [];
        for (let y = 0; y < bh; y++) {
            let n = 0;
            for (let x = 0; x < bw; x++) if (esPapel(x, y)) n++;
            if (n >= bw * 0.5) filas.push(y);
        }
        const cols: number[] = [];
        for (let x = 0; x < bw; x++) {
            let n = 0;
            for (let y = 0; y < bh; y++) if (esPapel(x, y)) n++;
            if (n >= bh * 0.5) cols.push(x);
        }
        if (!filas.length || !cols.length) return null;

        const y0 = filas[0] + 1;
        const y1 = filas[filas.length - 1];
        const x0 = cols[0] + 1;
        const x1 = cols[cols.length - 1];
        const hayMargen = filas[0] > 0 || cols[0] > 0 || y1 < bh - 1 || x1 < bw - 1;
        if (!hayMargen || y1 <= y0 || x1 <= x0) return null;

        const left = x0 * BLOQUE_FONDO;
        const top = y0 * BLOQUE_FONDO;
        const rect = {
            left,
            top,
            width: Math.min(width, x1 * BLOQUE_FONDO) - left,
            height: Math.min(height, y1 * BLOQUE_FONDO) - top,
        };
        // Sanidad: si "la hoja" resulta muy chica, la detección no es confiable.
        if (rect.width * rect.height < width * height * 0.25) return null;
        return rect;
    }

    // ─── Lectura de datos ─────────────────────────────────────────────────────

    private async getNombreEmpresa(ideEmpr: number) {
        const res = await this.dataSource.pool.query(
            `SELECT nom_empr, nom_corto_empr FROM sis_empresa WHERE ide_empr = $1`,
            [ideEmpr],
        );
        return [res.rows[0]?.nom_empr, res.rows[0]?.nom_corto_empr].filter(Boolean).join(' / ');
    }

    private prompt(empresa: string, modo: 'texto' | 'imagen') {
        const fuente = modo === 'texto'
            ? 'Te doy el TEXTO obtenido por OCR de una guía de envío'
            : 'Te doy la IMAGEN escaneada de una guía de envío';
        return `Eres un asistente que lee guías de envío de empresas de transporte/courier de Ecuador
(Servientrega, Tramaco, Laar, Urbano, cooperativas de buses, etc.). ${fuente}.
${empresa ? `El REMITENTE normalmente es "${empresa}" (la empresa que envía): no lo confundas con el destinatario.` : ''}
${DESCRIPCION_CAMPOS}`;
    }

    /** OCR primero (barato); GPT Vision si el texto no alcanza o faltan/no cuadran los datos clave. */
    private async leerDatos(
        imagen: Buffer,
        fileName: string,
        empresa: string,
    ): Promise<{ datos: DatosGuiaEnvio; origen: OrigenEscaneoGuia }> {
        let datosOcr: DatosGuiaEnvio | null = null;
        try {
            const texto = await this.ocrService.extractTextFromImage(await this.copiaParaOcr(imagen), fileName);
            if (texto.trim().length >= OCR_MIN_CARACTERES) {
                datosOcr = this.normalizar(await this.gptService.parseTextToJson(this.prompt(empresa, 'texto'), texto));
                if (!this.requiereVision(datosOcr)) return { datos: datosOcr, origen: 'ocr' };
                this.logger.log('Datos OCR incompletos o inconsistentes, reintentando con GPT Vision');
            }
        } catch (error) {
            this.logger.warn(`OCR de guía falló, usando GPT Vision: ${error?.message ?? error}`);
        }

        try {
            const datosVision = await this.leerConVision(imagen, empresa);
            // Lo que Vision no encontró se completa con lo que sí había leído el OCR.
            const datos = datosOcr ? this.combinar(datosVision, datosOcr) : datosVision;
            return { datos, origen: 'vision_fallback' };
        } catch (error) {
            this.logger.warn(`GPT Vision falló al leer la guía: ${error?.message ?? error}`);
            return { datos: datosOcr ?? this.vacio(), origen: 'ocr' };
        }
    }

    private async leerConVision(imagen: Buffer, empresa: string) {
        const sharp = (await import('sharp')).default;
        // 2000px de lado mayor es suficiente para Vision (detail: high) y abarata la llamada.
        const liviana = await sharp(imagen)
            .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        const res = await this.gptService.parseImageToJson(
            this.prompt(empresa, 'imagen'),
            liviana,
            'image/jpeg',
            'Lee esta guía de envío y extrae los datos solicitados.',
        );
        return this.normalizar(res);
    }

    /** Copia comprimida (< 1 MB) para OCR.space; en gris un documento comprime muy bien. */
    private async copiaParaOcr(imagen: Buffer) {
        const sharp = (await import('sharp')).default;
        for (const [lado, calidad] of [[2000, 80], [1600, 70], [1300, 60]] as const) {
            const copia = await sharp(imagen)
                .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: calidad })
                .toBuffer();
            if (copia.length <= OCR_MAX_BYTES) return copia;
        }
        return sharp(imagen).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 55 }).toBuffer();
    }

    private requiereVision(d: DatosGuiaEnvio) {
        if (!d.destinatario || d.total == null) return true;
        return !this.montosCuadran(d);
    }

    private montosCuadran(d: DatosGuiaEnvio) {
        if (d.baseImponible == null || d.iva == null || d.total == null) return true;
        return Math.abs(d.baseImponible + d.iva - d.total) <= 0.02;
    }

    private vacio(): DatosGuiaEnvio {
        return {
            destinatario: null,
            fechaEnvio: null,
            baseImponible: null,
            iva: null,
            total: null,
            numeroDocumento: null,
            tipoDocumento: null,
        };
    }

    private combinar(principal: DatosGuiaEnvio, respaldo: DatosGuiaEnvio): DatosGuiaEnvio {
        const out = { ...principal };
        (Object.keys(out) as (keyof DatosGuiaEnvio)[]).forEach((k) => {
            if (out[k] == null && respaldo[k] != null) (out as any)[k] = respaldo[k];
        });
        return out;
    }

    /** Limpia la respuesta del modelo: tipos, formato de fecha, montos y deriva el monto que
     * falte cuando los otros dos están (base + IVA = total). */
    private normalizar(res: any): DatosGuiaEnvio {
        const texto = (v: unknown) =>
            typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : null;
        const monto = (v: unknown) => {
            if (v == null || v === '') return null;
            let s = String(v).replace(/[^\d.,-]/g, '');
            // "1.234,56" / "12,50" -> coma decimal
            if (s.includes(',') && (!s.includes('.') || s.lastIndexOf(',') > s.lastIndexOf('.'))) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else {
                s = s.replace(/,/g, '');
            }
            const n = Number(s);
            return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
        };
        const fecha = (v: unknown) => {
            const s = texto(v);
            const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return null;
            const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            return d.getMonth() === Number(m[2]) - 1 ? s : null;
        };

        const datos: DatosGuiaEnvio = {
            destinatario: texto(res?.destinatario)?.toUpperCase() ?? null,
            fechaEnvio: fecha(res?.fechaEnvio),
            baseImponible: monto(res?.baseImponible),
            iva: monto(res?.iva),
            total: monto(res?.total),
            numeroDocumento: texto(res?.numeroDocumento),
            tipoDocumento: texto(res?.tipoDocumento),
        };
        const r2 = (n: number) => Math.round(n * 100) / 100;
        if (datos.baseImponible != null && datos.total != null && datos.iva == null) {
            datos.iva = r2(datos.total - datos.baseImponible);
        } else if (datos.iva != null && datos.total != null && datos.baseImponible == null) {
            datos.baseImponible = r2(datos.total - datos.iva);
        } else if (datos.baseImponible != null && datos.iva != null && datos.total == null) {
            datos.total = r2(datos.baseImponible + datos.iva);
        }
        return datos;
    }
}
