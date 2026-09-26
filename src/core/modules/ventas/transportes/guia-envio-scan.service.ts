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
// "Oscuridad" (0 = papel, 1 = negro) bajo la cual un píxel es papel -> blanco puro, y rango en
// el que se estira el trazo. Gamma < 1 REFUERZA el trazo pálido (copias a carbón, esfero suave).
const UMBRAL_PAPEL = 0.07;
const RANGO_TINTA = 0.45;
const GAMMA_TINTA = 0.75;
// Clasificación papel vs. mesa sobre el color promedio de cada bloque.
const PAPEL_LUM_MIN = 0.6;
const PAPEL_SAT_MAX = 0.25;
// Enderezado: inclinación máxima buscada y holgura del rectángulo de la hoja (perspectiva leve).
const ANGULO_MAX_ENDEREZAR = 10;
const MARGEN_RECTANGULO_BLOQUES = 1;
const MARGEN_BLANCO_PX = 24;
// OCR.space (plan gratuito) rechaza archivos de más de 1 MB.
const OCR_MAX_BYTES = 1_000_000;
const OCR_MIN_CARACTERES = 40;

const DESCRIPCION_CAMPOS = `
REGLA PRINCIPAL: NO INVENTES NI ADIVINES. Muchas guías se llenan A MANO: si un dato está
manuscrito y no se lee con total claridad, está tapado, borroso o solo se leen partes, devuelve
null para ese dato. Es preferible null a un valor dudoso. No completes, corrijas ni "normalices"
nombres con lo que parezca probable.
Campos a extraer:
- "destinatario": NOMBRE COMPLETO de la persona o empresa que RECIBE el paquete (aparece como
  "Destinatario", "Consignatario", "Para", "Recibe", "Cliente destino"). Solo el nombre: sin
  cédula, RUC, teléfono ni dirección. NUNCA el remitente (quien envía).
- "destinatarioLegible": true SOLO si leíste el nombre completo del destinatario letra por letra
  sin dudas; false si tuviste que suponer alguna parte (en ese caso "destinatario" = null).
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
{"destinatario": string|null, "destinatarioLegible": boolean, "fechaEnvio": string|null, "baseImponible": number|null,
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

        const { datos, origen } = await this.leerDatos(escaneada, fileName, empresa, dtoIn.porcentajeIva);
        return { fileName, origen, datos };
    }

    /**
     * Efecto "escáner a color" (tipo Adobe Scan, modo documento), afinado con fotos reales de
     * guías (Servientrega, Jhetro manuscrita y copia a carbón celeste sobre mesa de madera):
     * 1. Orientación EXIF y tamaño de trabajo (reduce fotos enormes, agranda hasta x2 las chicas).
     * 2. Color del PAPEL por zona y por canal (máximo por bloques -> suavizado). Cada píxel se
     *    expresa como "oscuridad" respecto de ese papel: quita sombras, iluminación despareja y
     *    el tinte del papel (rosado/celeste/amarillo), conservando el color de tinta y sellos.
     * 3. La mesa/fondo de la foto (ver mascaraExterior) queda en blanco, se recorta y se endereza
     *    la hoja si estaba girada unos grados.
     * 4. Curva que REFUERZA el trazo pálido (copias a carbón) en vez de aclararlo; lo que es
     *    papel pasa a blanco puro. Enfoque suave y margen blanco.
     * No corrige perspectiva fuerte (foto muy en ángulo): eso requiere detectar esquinas (fase 2).
     */
    private async generarEscaneo(input: Buffer): Promise<Buffer> {
        const sharp = (await import('sharp')).default;

        // El lado mayor es el mismo esté o no rotada la foto por EXIF.
        const meta = await sharp(input).metadata();
        const ladoMayor = Math.max(meta.width ?? 0, meta.height ?? 0) || LADO_MAX_ESCANEO;
        const ladoObjetivo = Math.min(LADO_MAX_ESCANEO, ladoMayor * FACTOR_MAX_AMPLIACION);

        const { data: rgb, info } = await sharp(input)
            .rotate()
            .resize({ width: ladoObjetivo, height: ladoObjetivo, fit: 'inside', kernel: 'lanczos3' })
            .removeAlpha()
            .toColourspace('srgb')
            .raw()
            .toBuffer({ resolveWithObject: true });
        const { width, height, channels } = info;
        const bw = Math.ceil(width / BLOQUE_FONDO);
        const bh = Math.ceil(height / BLOQUE_FONDO);

        // ── Color del papel: máximo por bloque y canal -> mediana + blur -> tamaño completo.
        const maximos = Buffer.alloc(bw * bh * 3);
        for (let y = 0; y < height; y++) {
            const fila = Math.floor(y / BLOQUE_FONDO) * bw;
            for (let x = 0; x < width; x++) {
                const p = (y * width + x) * channels;
                const b = (fila + Math.floor(x / BLOQUE_FONDO)) * 3;
                for (let c = 0; c < 3; c++) {
                    if (rgb[p + c] > maximos[b + c]) maximos[b + c] = rgb[p + c];
                }
            }
        }
        const grilla = await sharp(maximos, { raw: { width: bw, height: bh, channels: 3 } })
            .median(3)
            .blur(1.2)
            .raw()
            .toBuffer({ resolveWithObject: true });
        const fondo = await sharp(grilla.data, { raw: { width: bw, height: bh, channels: grilla.info.channels } })
            .resize(width, height, { kernel: 'cubic', fit: 'fill' })
            .raw()
            .toBuffer({ resolveWithObject: true });
        const fc = fondo.info.channels;

        // ── Mesa / fondo de la foto -> blanco (máscara suavizada a tamaño completo).
        const promedios = await sharp(rgb, { raw: { width, height, channels } })
            .resize(bw, bh, { fit: 'fill' })
            .raw()
            .toBuffer({ resolveWithObject: true });
        const { exterior, angulo } = this.mascaraExterior(promedios.data, promedios.info.channels, bw, bh);
        const mascara = await sharp(Buffer.from(this.dilatar(exterior, bw, bh).map((v) => v * 255)), {
            raw: { width: bw, height: bh, channels: 1 },
        })
            .resize(width, height, { kernel: 'cubic', fit: 'fill' })
            .blur(3)
            .toColourspace('b-w')
            .raw()
            .toBuffer({ resolveWithObject: true });
        const mc = mascara.info.channels;

        // ── Nivel real del papel: el máximo por bloque queda por encima del papel promedio (brillos,
        // ruido), así que se calibra con la mediana-alta de la relación píxel/fondo en la hoja.
        const hist = new Uint32Array(256);
        for (let i = 0; i < width * height; i += 7) {
            if (mascara.data[i * mc] > 10) continue;
            let suma = 0;
            for (let c = 0; c < 3; c++) suma += rgb[i * channels + c] / Math.max(fondo.data[i * fc + c], 1);
            hist[Math.min(255, Math.round((suma / 3) * 200))]++;
        }
        const totalHist = hist.reduce((a, b) => a + b, 0);
        let nivelPapel = 0.95;
        for (let k = 0, acc = 0; k < 256; k++) {
            acc += hist[k];
            if (acc >= totalHist * 0.6) {
                nivelPapel = Math.max(k / 200, 0.5);
                break;
            }
        }

        // ── Recorte a la hoja (todo lo que no es exterior).
        let x0 = bw, y0 = bh, x1 = -1, y1 = -1;
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                if (exterior[y * bw + x]) continue;
                x0 = Math.min(x0, x); x1 = Math.max(x1, x);
                y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
        }
        const r = x1 < 0
            ? { left: 0, top: 0, width, height }
            : {
                left: x0 * BLOQUE_FONDO,
                top: y0 * BLOQUE_FONDO,
                width: Math.min(width, (x1 + 1) * BLOQUE_FONDO) - x0 * BLOQUE_FONDO,
                height: Math.min(height, (y1 + 1) * BLOQUE_FONDO) - y0 * BLOQUE_FONDO,
            };

        // ── Render: oscuridad respecto del papel -> blanco puro bajo el umbral; sobre él, curva
        // (gamma < 1) que refuerza el trazo pálido conservando el color de cada canal.
        const salida = Buffer.alloc(r.width * r.height * 3);
        const oscuridad = [0, 0, 0];
        for (let y = 0; y < r.height; y++) {
            for (let x = 0; x < r.width; x++) {
                const i = (y + r.top) * width + (x + r.left);
                const o = (y * r.width + x) * 3;
                for (let c = 0; c < 3; c++) {
                    oscuridad[c] = Math.max(
                        0,
                        1 - rgb[i * channels + c] / Math.max(fondo.data[i * fc + c], 1) / nivelPapel,
                    );
                }
                const lum = 0.299 * oscuridad[0] + 0.587 * oscuridad[1] + 0.114 * oscuridad[2];
                if (lum < UMBRAL_PAPEL) {
                    salida[o] = 255;
                    salida[o + 1] = 255;
                    salida[o + 2] = 255;
                    continue;
                }
                const exteriorPeso = mascara.data[i * mc] / 255;
                for (let c = 0; c < 3; c++) {
                    const t = Math.min(1, Math.max(0, (oscuridad[c] - UMBRAL_PAPEL) / RANGO_TINTA)) ** GAMMA_TINTA;
                    const v = 255 * (1 - t);
                    salida[o + c] = Math.round(v + (255 - v) * exteriorPeso);
                }
            }
        }

        let resultado: { data: Buffer; width: number; height: number } = { data: salida, width: r.width, height: r.height };
        if (Math.abs(angulo) >= 0.5) {
            const girada = await sharp(salida, { raw: { width: r.width, height: r.height, channels: 3 } })
                .rotate(-angulo, { background: '#ffffff' })
                .raw()
                .toBuffer({ resolveWithObject: true });
            resultado = { data: girada.data, width: girada.info.width, height: girada.info.height };
        }

        return sharp(resultado.data, { raw: { width: resultado.width, height: resultado.height, channels: 3 } })
            .trim({ background: '#ffffff', threshold: 10 })
            .sharpen({ sigma: 0.8 })
            .extend({
                top: MARGEN_BLANCO_PX,
                bottom: MARGEN_BLANCO_PX,
                left: MARGEN_BLANCO_PX,
                right: MARGEN_BLANCO_PX,
                background: { r: 255, g: 255, b: 255 },
            })
            // 4:4:4: sin submuestreo de color, para que los bordes de letras de color no se ensucien.
            .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
            .toBuffer();
    }

    /**
     * Qué bloques NO son la hoja (mesa, fondo de la foto), sobre el color promedio de cada bloque:
     * 1. Papel = claro y poco saturado (la madera es saturada; una copia celeste/rosada/amarilla
     *    no). Se usa el promedio, no el máximo: el máximo agarra los reflejos de la veta.
     * 2. Exterior = no-papel conectado al borde de la foto (las franjas de color DENTRO de la
     *    guía no tocan el borde y se conservan).
     * 3. Solo la zona restante más grande es la hoja: islas sueltas (reflejos) -> exterior.
     * 4. Rectángulo inclinado que mejor encierra la hoja (probando -10°..10°, ignorando salientes
     *    con percentiles): lo que queda fuera -> exterior. Su ángulo sirve para enderezarla.
     */
    private mascaraExterior(prom: Buffer, ch: number, bw: number, bh: number) {
        const n = bw * bh;
        const lum = new Float32Array(n);
        const esPapel = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const [r, g, b] = [prom[i * ch], prom[i * ch + 1], prom[i * ch + 2]];
            lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
        const referencia = Array.from(lum).sort((a, b) => a - b)[Math.floor(n * 0.9)];
        for (let i = 0; i < n; i++) {
            const [r, g, b] = [prom[i * ch], prom[i * ch + 1], prom[i * ch + 2]];
            const mx = Math.max(r, g, b);
            const saturacion = mx ? (mx - Math.min(r, g, b)) / mx : 0;
            esPapel[i] = lum[i] >= referencia * PAPEL_LUM_MIN && saturacion < PAPEL_SAT_MAX ? 1 : 0;
        }

        const vecinos = (i: number) => {
            const x = i % bw;
            const y = (i / bw) | 0;
            return [x > 0 ? i - 1 : -1, x < bw - 1 ? i + 1 : -1, y > 0 ? i - bw : -1, y < bh - 1 ? i + bw : -1];
        };

        // 2. No-papel conectado al borde.
        const exterior = new Uint8Array(n);
        const pila: number[] = [];
        for (let x = 0; x < bw; x++) pila.push(x, (bh - 1) * bw + x);
        for (let y = 0; y < bh; y++) pila.push(y * bw, y * bw + bw - 1);
        while (pila.length) {
            const i = pila.pop()!;
            if (exterior[i] || esPapel[i]) continue;
            exterior[i] = 1;
            vecinos(i).forEach((j) => j >= 0 && pila.push(j));
        }

        // 3. Zona interior más grande.
        const comp = new Int32Array(n).fill(-1);
        let mayor = -1;
        let mayorTam = 0;
        for (let s = 0, id = 0; s < n; s++) {
            if (exterior[s] || comp[s] >= 0) continue;
            let tam = 0;
            const st = [s];
            comp[s] = id;
            while (st.length) {
                const i = st.pop()!;
                tam++;
                vecinos(i).forEach((j) => {
                    if (j >= 0 && !exterior[j] && comp[j] < 0) {
                        comp[j] = id;
                        st.push(j);
                    }
                });
            }
            if (tam > mayorTam) {
                mayorTam = tam;
                mayor = id;
            }
            id++;
        }
        for (let i = 0; i < n; i++) if (!exterior[i] && comp[i] !== mayor) exterior[i] = 1;

        // 4. Rectángulo inclinado.
        const puntos: [number, number][] = [];
        for (let i = 0; i < n; i++) if (!exterior[i]) puntos.push([(i % bw) + 0.5, ((i / bw) | 0) + 0.5]);
        if (puntos.length < n * 0.2) return { exterior: new Uint8Array(n), angulo: 0 }; // detección dudosa
        const pct = (arr: number[], q: number) => arr[Math.round(q * (arr.length - 1))];
        let mejor = { angulo: 0, cos: 1, sin: 0, u0: 0, u1: 0, v0: 0, v1: 0, area: Infinity };
        for (let a = -ANGULO_MAX_ENDEREZAR; a <= ANGULO_MAX_ENDEREZAR; a += 0.5) {
            const t = (a * Math.PI) / 180;
            const [cos, sin] = [Math.cos(t), Math.sin(t)];
            const us = puntos.map(([x, y]) => x * cos + y * sin).sort((p, q) => p - q);
            const vs = puntos.map(([x, y]) => -x * sin + y * cos).sort((p, q) => p - q);
            const cand = { angulo: a, cos, sin, u0: pct(us, 0.005), u1: pct(us, 0.995), v0: pct(vs, 0.005), v1: pct(vs, 0.995), area: 0 };
            cand.area = (cand.u1 - cand.u0) * (cand.v1 - cand.v0);
            if (cand.area < mejor.area) mejor = cand;
        }
        for (let i = 0; i < n; i++) {
            const x = (i % bw) + 0.5;
            const y = ((i / bw) | 0) + 0.5;
            const u = x * mejor.cos + y * mejor.sin;
            const v = -x * mejor.sin + y * mejor.cos;
            const m = MARGEN_RECTANGULO_BLOQUES;
            if (u < mejor.u0 - m || u > mejor.u1 + m || v < mejor.v0 - m || v > mejor.v1 + m) exterior[i] = 1;
        }
        return { exterior, angulo: mejor.angulo };
    }

    /** Crece la máscara exterior 1 bloque para "comerse" el borde de la hoja / sombra. */
    private dilatar(mask: Uint8Array, bw: number, bh: number) {
        const out = new Uint8Array(mask.length);
        for (let y = 0; y < bh; y++) {
            for (let x = 0; x < bw; x++) {
                let v = 0;
                for (let dy = -1; dy <= 1 && !v; dy++) {
                    for (let dx = -1; dx <= 1 && !v; dx++) {
                        const xx = x + dx;
                        const yy = y + dy;
                        if (xx >= 0 && yy >= 0 && xx < bw && yy < bh && mask[yy * bw + xx]) v = 1;
                    }
                }
                out[y * bw + x] = v;
            }
        }
        return out;
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
        porcentajeIva?: number,
    ): Promise<{ datos: DatosGuiaEnvio; origen: OrigenEscaneoGuia }> {
        let datosOcr: DatosGuiaEnvio | null = null;
        try {
            const texto = await this.ocrService.extractTextFromImage(await this.copiaParaOcr(imagen), fileName);
            if (texto.trim().length >= OCR_MIN_CARACTERES) {
                datosOcr = this.normalizar(
                    await this.gptService.parseTextToJson(this.prompt(empresa, 'texto'), texto),
                    empresa,
                );
                if (!this.requiereVision(datosOcr, porcentajeIva)) return { datos: datosOcr, origen: 'ocr' };
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
        return this.normalizar(res, empresa);
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

    private requiereVision(d: DatosGuiaEnvio, porcentajeIva?: number) {
        if (!d.destinatario || d.total == null) return true;
        return !this.montosCuadran(d, porcentajeIva);
    }

    /** Base + IVA = total y, si hay IVA, que sea la base por el IVA vigente del sistema (misma
     * regla que valida el frontend antes de permitir aplicar los montos). */
    private montosCuadran(d: DatosGuiaEnvio, porcentajeIva?: number) {
        if (d.baseImponible == null || d.iva == null || d.total == null) return true;
        if (Math.abs(d.baseImponible + d.iva - d.total) > 0.02) return false;
        if (d.iva > 0 && porcentajeIva) {
            return Math.abs((d.baseImponible * porcentajeIva) / 100 - d.iva) <= 0.02;
        }
        return true;
    }

    /**
     * Descarta nombres que no parecen legibles de verdad (guías manuscritas mal leídas): con
     * dígitos o símbolos raros, sin al menos una palabra de 3+ letras, casi sin letras, o que
     * en realidad son el remitente (la propia empresa). Mejor "no detectado" que un nombre
     * inventado: el usuario lo digita o usa el del cliente.
     */
    private nombreConfiable(nombre: string | null, empresa: string): string | null {
        if (!nombre) return null;
        const limpio = nombre.toUpperCase();
        if (/[0-9?_*#@=<>{}[\]|\\/]/.test(limpio)) return null;
        const letras = (limpio.match(/[A-ZÁÉÍÓÚÑÜ]/g) ?? []).length;
        if (letras < 4 || letras / limpio.replace(/\s/g, '').length < 0.8) return null;
        if (!limpio.split(' ').some((p) => /^[A-ZÁÉÍÓÚÑÜ]{3,}$/.test(p.replace(/[.,]/g, '')))) return null;
        // Es el remitente si contiene TODAS las palabras significativas de alguno de los nombres
        // de la empresa (razón social o nombre corto) - una palabra suelta en común no basta.
        const esRemitente = empresa
            .toUpperCase()
            .split(' / ')
            .map((n) => n.split(/\s+/).filter((p) => p.replace(/[.,]/g, '').length >= 4))
            .some((palabras) => palabras.length > 0 && palabras.every((p) => limpio.includes(p)));
        if (esRemitente) return null;
        return limpio;
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
    private normalizar(res: any, empresa = ''): DatosGuiaEnvio {
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
            destinatario: res?.destinatarioLegible === false ? null : this.nombreConfiable(texto(res?.destinatario), empresa),
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
