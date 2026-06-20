import fs from 'node:fs';
import path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { FILE_STORAGE_CONSTANTS } from 'src/core/modules/sistema/files/constants/files.constants';
import { v4 as uuid } from 'uuid';

const CANVAS = 1000;

interface ParsedProductData {
    titulo: string;
    descripcion: string;
    imagenes: string[];
    especificaciones: string;
}

export interface HtmlProductResult {
    imagenes: string[];
    titulo: string;
    descCorta: string;
    descLarga: string;
    otrosNombres: string;
}

@Injectable()
export class HtmlProductService {
    private readonly logger = new Logger(HtmlProductService.name);
    private watermarkBuffer: Buffer | null = null;
    private watermarkEmpresa: string | null = null;

    constructor(
        private readonly gptService: GptService,
        private readonly dataSource: DataSourceService,
    ) { }

    async extractFromHtml(html: string, ideEmpr: number, sourceUrl?: string, ideInarti?: number): Promise<HtmlProductResult> {
        const startTime = Date.now();
        this.logger.log(`[INICIO] ideInarti=${ideInarti ?? 'nuevo'} html=${html.length} chars url=${(sourceUrl || '').substring(0, 60)}`);

        this.ensureTempDir();

        // ── Fase 1: Parsear HTML ──
        this.logger.log('[FASE 1/3] Parseando HTML...');
        const parsed = this.parseHtml(html, sourceUrl);
        this.logger.log(`[FASE 1/3] Parseo completado — ${parsed.imagenes.length} imágenes, título="${parsed.titulo?.substring(0, 50)}...", desc=${parsed.descripcion.length} chars, specs=${parsed.especificaciones.length} chars`);

        // ── Fase 2: Imágenes ──
        this.logger.log(`[FASE 2/3] Procesando ${parsed.imagenes.length} imágenes (Sharp: fondo blanco, ${CANVAS}x${CANVAS}, watermark)...`);
        const processedImages = await this.downloadAndProcessImages(parsed.imagenes, ideEmpr);
        this.logger.log(`[FASE 2/3] Imágenes — ${processedImages.length}/${parsed.imagenes.length} exitosas`);

        // ── Fase 3: OpenAI ──
        const inputChars = parsed.descripcion.length + parsed.especificaciones.length;
        if (inputChars > 20) {
            this.logger.log(`[FASE 3/3] Normalizando con OpenAI (${inputChars} chars de entrada)...`);
        } else {
            this.logger.warn(`[FASE 3/3] Poco contenido (${inputChars} chars). OpenAI omitido, usando datos crudos.`);
        }
        const normalized = await this.normalizeWithOpenAI(parsed, inputChars);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        this.logger.log(`[COMPLETADO] ${elapsed}s — ${processedImages.length} img | descCorta=${normalized.descripcionCorta.length}c | descLarga=${normalized.descripcionLarga.length}c`);

        return {
            imagenes: processedImages,
            titulo: parsed.titulo,
            descCorta: normalized.descripcionCorta,
            descLarga: normalized.descripcionLarga,
            otrosNombres: normalized.otrosNombres || parsed.titulo,
        };
    }

    // ─── FASE 1: Parsear HTML con Cheerio ────────────────────────────────────

    private parseHtml(html: string, sourceUrl?: string): ParsedProductData {
        const $ = cheerio.load(html);

        // ── Título ──
        let titulo = $('meta[property="og:title"]').attr('content')?.trim()
            || $('h1').first().text().trim()
            || $('title').text().trim()
            || '';

        // Limpiar sufijos SEO: " - Buy ... Product on Alibaba.com"
        titulo = titulo
            .replace(/\s*[-–|]\s*(Buy|Comprar|Shop|Purchase|Find|Get|Order|Wholesale).*$/is, '')
            .replace(/[\n\r]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        // ── Descripción ──
        let descripcion = $('meta[name="description"]').attr('content')?.trim()
            || $('meta[property="og:description"]').attr('content')?.trim()
            || '';

        if (!descripcion || descripcion.length < 30) {
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            descripcion = bodyText.substring(0, 3000);
        }

        // ── Imágenes (de JSON-LD, og:image, e img tags) ──
        const imagenes = this.extractImages($, sourceUrl);

        // ── Especificaciones (de JSON-LD y tablas) ──
        const especificaciones = this.extractSpecifications($);

        this.logger.log(`  [Parseo] Título="${titulo?.substring(0, 50)}..." | ${imagenes.length} img | desc=${descripcion.length}c | specs=${especificaciones.length}c`);

        return { titulo, descripcion, imagenes, especificaciones };
    }

    private extractImages($: cheerio.CheerioAPI, sourceUrl?: string): string[] {
        const urls: string[] = [];
        const seen = new Set<string>();

        const addUrl = (src: string) => {
            if (!src) return;
            let clean = src.trim();
            // Omitir placeholders, SVGs inline, data URIs
            if (!clean || clean.startsWith('data:') || clean.includes('placeholder') || clean.includes('no-image')) return;
            clean = this.normalizeImageUrl(clean, sourceUrl);
            if (!seen.has(clean)) {
                seen.add(clean);
                urls.push(clean);
            }
        };

        // 1. JSON-LD structured data
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html() || '');
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    if (item.image) {
                        const imgs = Array.isArray(item.image) ? item.image : [item.image];
                        for (const img of imgs) {
                            if (img && typeof img === 'string') addUrl(img);
                        }
                    }
                }
            } catch { /* ignorar */ }
        });

        // 2. og:image
        $('meta[property="og:image"]').each((_, el) => {
            addUrl($(el).attr('content') || '');
        });

        // 3. Scripts con JSON embebido (window.detailData, window.__DATA__, etc.)
        $('script:not([src])').each((_, el) => {
            const text = $(el).html() || '';
            if (!text.includes('mediaItems') && !text.includes('imageUrl') && !text.includes('"image"')) return;
            try {
                const mediaUrls = this.extractImageUrlsFromJsonText(text);
                for (const u of mediaUrls) addUrl(u);
            } catch { /* ignorar */ }
        });

        // 4. img tags (producto, no logos/iconos)
        $('img').each((_, el) => {
            const src = $(el).attr('src')
                || $(el).attr('data-src')
                || $(el).attr('data-original')
                || $(el).attr('srcset')?.split(',')[0]?.trim()?.split(' ')[0]
                || '';
            if (!src) return;
            const lower = src.toLowerCase();
            if (lower.includes('icon') || lower.includes('logo') || lower.includes('avatar')
                || lower.includes('banner') || lower.includes('flag') || lower.includes('favicon')) return;
            addUrl(src);
        });

        // 5. Style background-image
        $('[style*="background-image"]').each((_, el) => {
            const style = ($(el).attr('style') || '');
            const match = style.match(/url\(["']?([^"')]+)["']?\)/);
            if (match?.[1] && (match[1].startsWith('http') || match[1].startsWith('//'))) addUrl(match[1]);
        });

        // Excluir thumbnails (imágenes < 200px)
        const filtered = this.excludeTinyImages(urls);

        return filtered.slice(0, 20);
    }

    private extractImageUrlsFromJsonText(text: string): string[] {
        const results: string[] = [];
        // Buscar URLs de imagen en JSON embebido (http, https, y protocol-relative //)
        const regex = /(?:(?:https?:)?\/\/)[^"'\s]+?\.(?:jpg|jpeg|png|webp|gif)/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            let url = match[0];
            // Normalizar protocol-relative → https
            if (url.startsWith('//')) url = 'https:' + url;
            if (!url.includes('icon') && !url.includes('logo') && !url.includes('avatar')
                && !url.includes('banner') && !url.includes('flag') && !url.includes('favicon')) {
                results.push(url);
            }
        }
        return results;
    }

    private excludeTinyImages(urls: string[]): string[] {
        return urls.filter((url) => {
            // URLs con dimensiones explícitas: _WxH o _WxHqXX
            const match = url.match(/[._-](\d{2,4})x(\d{2,4})(?:q\d+)?\.(?:jpg|jpeg|png|webp)/i);
            if (match) {
                const w = parseInt(match[1], 10);
                const h = parseInt(match[2], 10);
                // Excluir thumbnails menores a 200px en cualquiera de sus lados
                if (w < 200 && h < 200) return false;
            }
            // Si no tiene dimensión explícita, es imagen original/full-size → conservar
            return true;
        });
    }

    private normalizeImageUrl(src: string, sourceUrl?: string): string {
        let url = src.trim();
        // Protocolo relativo → absoluto
        if (url.startsWith('//')) {
            url = 'https:' + url;
        }
        // Ruta relativa → absoluta
        if (url.startsWith('/') && !url.startsWith('//') && sourceUrl) {
            try {
                const base = new URL(sourceUrl);
                url = `${base.protocol}//${base.host}${url}`;
            } catch { /* ignorar */ }
        }
        return url;
    }

    private extractSpecifications($: cheerio.CheerioAPI): string {
        const parts: string[] = [];

        // 1. JSON-LD structured data (description field)
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html() || '');
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    if (item.description && typeof item.description === 'string' && item.description.length > 30) {
                        parts.push(item.description);
                    }
                }
            } catch { /* ignorar */ }
        });

        // 2. Tablas con atributos (dt/dd, tr/td, .attribute-table)
        const tables = $('table[class*="attr"], table[class*="spec"], .attribute-table, .specification-table, .do-detail-attribute');
        if (tables.length > 0) {
            tables.each((_, table) => {
                const rows: string[] = [];
                $(table).find('tr').each((_, tr) => {
                    const cells = $(tr).find('td, th');
                    if (cells.length === 2) {
                        rows.push(`${$(cells[0]).text().trim()}: ${$(cells[1]).text().trim()}`);
                    }
                });
                if (rows.length > 0) parts.push(rows.join('\n'));
            });
        }

        // 3. dt/dd genéricos
        if (parts.length === 0) {
            $('dt').each((_, dt) => {
                const key = $(dt).text().trim();
                const val = $(dt).next('dd').text().trim();
                if (key && val) parts.push(`${key}: ${val}`);
            });
        }

        // 4. Atributos en texto (clave: valor)
        if (parts.length === 0) {
            const attrDivs = $('[data-module="attribute"], [class*="attribute"], [class*="product-attr"]');
            if (attrDivs.length > 0) {
                parts.push(attrDivs.text().replace(/\s+/g, ' ').trim());
            }
        }

        return parts.join('\n').substring(0, 5000);
    }

    // ─── FASE 2: Descargar y procesar imágenes ──────────────────────────

    private async downloadAndProcessImages(imageUrls: string[], ideEmpr: number): Promise<string[]> {
        const processed: string[] = [];
        const watermark = await this.getSimpleWatermark(ideEmpr);
        const total = imageUrls.length;

        for (let i = 0; i < total; i++) {
            const url = imageUrls[i];
            try {
                this.logger.log(`  [Imagen ${i + 1}/${total}] Descargando: ${url.substring(0, 80)}...`);
                const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
                if (!response.ok) {
                    this.logger.warn(`  [Imagen ${i + 1}/${total}] HTTP ${response.status} — omitiendo`);
                    continue;
                }
                const buffer = Buffer.from(await response.arrayBuffer());
                const fileName = `${uuid()}.jpg`;
                const tempPath = path.join(FILE_STORAGE_CONSTANTS.IMAGES_HTML_DIR, fileName);

                this.logger.log(`  [Imagen ${i + 1}/${total}] Procesando con Sharp (cover para llenar canvas)...`);
                await sharp(buffer)
                    .flatten({ background: '#FFFFFF' })
                    .resize(CANVAS, CANVAS, { fit: 'cover', position: 'center' })
                    .composite([{ input: watermark, blend: 'over' }])
                    .jpeg({ quality: 90 })
                    .toFile(tempPath);

                processed.push(fileName);
                this.logger.log(`  [Imagen ${i + 1}/${total}] OK — ${fileName}`);
            } catch (err) {
                this.logger.warn(`  [Imagen ${i + 1}/${total}] ERROR: ${err.message}`);
            }
        }

        return processed;
    }

    // ─── MARCA DE AGUA ──────────────────────────────────────────────────

    private async getSimpleWatermark(ideEmpr: number): Promise<Buffer> {
        const empresa = await this.loadEmpresaData(ideEmpr);
        const logoBuffer = await this.loadLogo(empresa.logoPath);

        const composites: sharp.OverlayOptions[] = [];

        // Centro + footer (sin moléculas)
        const overlaySvg = this.buildSimpleOverlaySvg(empresa.nomCorto, empresa.pagina);
        composites.push({ input: Buffer.from(overlaySvg), blend: 'over' });

        // Logo card visible
        if (logoBuffer) {
            const logoNoBg = await this.removeWhiteBackground(logoBuffer);
            const logoResized = await sharp(logoNoBg)
                .resize(140, 140, { fit: 'inside' })
                .png()
                .toBuffer();
            const cardSvg = this.buildLogoCardSvg();
            composites.push({ input: Buffer.from(cardSvg), blend: 'over' });
            composites.push({
                input: logoResized,
                blend: 'over',
                left: CANVAS - 158,
                top: 16,
            });
        }

        return sharp({
            create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
        }).composite(composites).png().toBuffer();
    }

    private buildSimpleOverlaySvg(nomCorto: string, pagina: string): string {
        const centerText = nomCorto ? this.buildCenterWatermarkSvg(nomCorto) : '';
        const footer = pagina ? this.buildFooterCardSvg(pagina) : '';

        return `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="white" stop-opacity="0.60"/>
                    <stop offset="100%" stop-color="white" stop-opacity="0.25"/>
                </linearGradient>
            </defs>
            ${centerText}
            ${footer}
        </svg>`;
    }

    private async getWatermark(ideEmpr: number): Promise<Buffer> {
        if (this.watermarkBuffer && this.watermarkEmpresa !== null) {
            return this.watermarkBuffer;
        }

        this.logger.log('  [Watermark] Cargando datos de empresa...');
        const empresa = await this.loadEmpresaData(ideEmpr);

        if (this.watermarkBuffer && this.watermarkEmpresa === empresa.logoPath) {
            return this.watermarkBuffer;
        }

        this.logger.log(`  [Watermark] Cargando logo: ${empresa.logoPath || '(no disponible)'}`);
        const logoBuffer = await this.loadLogo(empresa.logoPath);

        // Capas del watermark (de fondo a frente):
        // 1. Átomos + texto central (SVG)
        // 2. Footer card full-width con página web (SVG)
        // 3. Logo card top-right (SVG)
        // 4. Logo PNG (sobre el card)

        const composites: sharp.OverlayOptions[] = [];

        // Capa 1+2: Átomos + texto central + footer en un solo SVG
        const mainSvg = this.buildMainOverlaySvg(empresa.nomCorto, empresa.pagina);
        composites.push({ input: Buffer.from(mainSvg), blend: 'over' });

        // Capa 3+4: Logo card + logo
        if (logoBuffer) {
            this.logger.log('  [Watermark] Procesando logo...');
            const logoNoBg = await this.removeWhiteBackground(logoBuffer);
            const logoResized = await sharp(logoNoBg)
                .resize(120, 120, { fit: 'inside' })
                .png()
                .toBuffer();

            const logoCardSvg = this.buildLogoCardSvg();
            composites.push({ input: Buffer.from(logoCardSvg), blend: 'over' });
            // Card 152×152 en (1038, 8) — logo 120×120 centrado
            composites.push({
                input: logoResized,
                blend: 'over',
                left: 1054,
                top: 24,
            });
        }

        this.logger.log('  [Watermark] Renderizando...');
        this.watermarkBuffer = await sharp({
            create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
        }).composite(composites).png().toBuffer();

        this.watermarkEmpresa = empresa.logoPath;
        return this.watermarkBuffer;
    }

    private buildMainOverlaySvg(nomCorto: string, pagina: string): string {
        const centerText = nomCorto ? this.buildCenterWatermarkSvg(nomCorto) : '';
        const footerCard = pagina ? this.buildFooterCardSvg(pagina) : '';

        return `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="white" stop-opacity="0.60"/>
                    <stop offset="100%" stop-color="white" stop-opacity="0.25"/>
                </linearGradient>
            </defs>
            <rect width="${CANVAS}" height="${CANVAS}" fill="url(#atoms)" opacity="0.10"/>
            ${centerText}
            ${footerCard}
        </svg>`;
    }

    private buildCenterWatermarkSvg(nomCorto: string): string {
        return `<text x="${CANVAS / 2}" y="${Math.round(CANVAS * 0.53)}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="72" font-weight="700" fill="#333333" opacity="0.10" transform="rotate(-20, ${CANVAS / 2}, ${CANVAS / 2})" letter-spacing="12">${this.escapeXml(nomCorto)}</text>`;
    }

    private buildFooterCardSvg(pagina: string): string {
        return `<g>
            <rect x="0" y="${CANVAS - 70}" width="${CANVAS}" height="70" fill="url(#cardGrad)" rx="0"/>
            <text x="${CANVAS / 2}" y="${CANVAS - 28}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="24" font-weight="700" fill="#000000" opacity="0.85" letter-spacing="1.5">${this.escapeXml(pagina)}</text>
        </g>`;
    }

    private buildLogoCardSvg(): string {
        return `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="white" stop-opacity="0.55"/>
                    <stop offset="100%" stop-color="white" stop-opacity="0.25"/>
                </linearGradient>
            </defs>
            <rect x="${CANVAS - 162}" y="8" width="140" height="140" rx="12" fill="url(#logoGrad)" stroke="white" stroke-width="0.5" stroke-opacity="0.6"/>
        </svg>`;
    }

    private generateAtomPattern(): string {
        let svg = '';
        const nodes = [
            { cx: 80, cy: 120, r: 18 },
            { cx: 180, cy: 60, r: 18 },
            { cx: 180, cy: 180, r: 18 },
            { cx: 100, cy: 240, r: 14 },
            { cx: 220, cy: 240, r: 14 },
            { cx: 260, cy: 140, r: 16 },
        ];
        for (const n of nodes) {
            svg += `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="none" stroke="#2563eb" stroke-width="2.5"/>`;
            svg += `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r * 0.5}" fill="#3b82f6" opacity="0.3"/>`;
        }
        const bonds = [
            [80, 120, 180, 60], [80, 120, 180, 180], [100, 240, 80, 120],
            [180, 180, 220, 240], [180, 60, 260, 140], [180, 180, 260, 140],
            [260, 140, 300, 180], [220, 240, 300, 280], [0, 160, 80, 120],
        ];
        for (const [x1, y1, x2, y2] of bonds) {
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2563eb" stroke-width="1.8" opacity="0.7"/>`;
        }
        return svg;
    }

    private escapeXml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private async loadEmpresaData(ideEmpr: number): Promise<{ logoPath: string; nomCorto: string; pagina: string }> {
        try {
            const query = await this.dataSource.pool.query(
                `SELECT nom_corto_empr, pagina_empr, logotipo_empr FROM sis_empresa WHERE ide_empr = $1`,
                [ideEmpr],
            );
            const row = query.rows[0];
            return {
                nomCorto: row?.nom_corto_empr || '',
                pagina: row?.pagina_empr || '',
                logoPath: row?.logotipo_empr || '',
            };
        } catch {
            return { nomCorto: '', pagina: '', logoPath: '' };
        }
    }

    private async loadLogo(logoPath: string): Promise<Buffer | null> {
        if (!logoPath) return null;
        try {
            const fullPath = path.join(envs.pathDrive, logoPath);
            if (fs.existsSync(fullPath)) {
                return await sharp(fullPath).png().toBuffer();
            }
        } catch { /* no disponible */ }
        return null;
    }

    private async removeWhiteBackground(buffer: Buffer): Promise<Buffer> {
        const { data, info } = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
                data[i + 3] = 0;
            }
        }

        return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
            .png()
            .toBuffer();
    }

    // ─── FASE 3: Normalización con OpenAI ───────────────────────────────────

    private async normalizeWithOpenAI(
        parsed: ParsedProductData,
        inputChars: number,
    ): Promise<{ descripcionCorta: string; descripcionLarga: string; otrosNombres: string }> {
        if (inputChars <= 20) {
            return {
                descripcionCorta: parsed.descripcion?.substring(0, 300) || '',
                descripcionLarga: parsed.descripcion || '',
                otrosNombres: parsed.titulo || '',
            };
        }

        const contenido = [
            `TÍTULO DEL PRODUCTO: ${parsed.titulo}`,
            parsed.descripcion ? `DESCRIPCIÓN ORIGINAL:\n${parsed.descripcion}` : '',
            parsed.especificaciones ? `ESPECIFICACIONES:\n${parsed.especificaciones}` : '',
        ].filter(Boolean).join('\n\n');

        const prompt = `Eres un experto en marketing digital y ecommerce.

A partir de la información extraída de un producto, debes organizar y estandarizar la información en español.

REGLAS OBLIGATORIAS:
1. NO inventes características, propiedades ni información que NO esté presente en la fuente.
2. NO añadas datos técnicos que no aparezcan explícitamente en el texto original.
3. SOLO organiza, estructura y redacta de forma clara y profesional la información que YA existe.
4. Si la fuente no menciona usos o aplicaciones, NO los inventes.
5. Todo el contenido debe estar en español.
6. PROHIBIDO incluir información del proveedor, fabricante, nombre de empresa, años de experiencia, certificaciones ni ubicación del fabricante en ninguna sección de la respuesta. Omite cualquier dato que identifique al vendedor.

Debes devolver un JSON con esta estructura:
{
  "descripcionCorta": "Descripción breve y comercial del producto (máximo 80 palabras), en español. Resume lo más importante: qué es, material principal y uso principal. Solo con información de la fuente.",
  "descripcionLarga": "Descripción extensa en formato HTML. OBLIGATORIO incluir TODOS los datos de las ESPECIFICACIONES proporcionadas (tamaño, peso, material, color, forma, características, etc.) en la sección <h6>Especificaciones y Características</h6> usando <ul><li> para cada atributo. Si hay usos o aplicaciones en la fuente, incluye <h6>Usos y Aplicaciones</h6> con <ul><li>. Usa <p> para párrafos. No uses <h2>, usa <h6>. NO incluyas fabricante, proveedor, ni empresa.",
  "otrosNombres": "Máximo 3 nombres comerciales o alternativos del producto en español, separados por comas. Si no hay, devuelve el título del producto."
}`;

        try {
            this.logger.log('  [OpenAI] Enviando prompt a GPT-4o-mini...');
            const result = await this.gptService.parseTextToJson(prompt, contenido);
            this.logger.log('  [OpenAI] Respuesta recibida OK.');
            return {
                descripcionCorta: result.descripcionCorta || '',
                descripcionLarga: result.descripcionLarga || '',
                otrosNombres: result.otrosNombres || parsed.titulo || '',
            };
        } catch (err) {
            this.logger.error(`  [OpenAI] FALLÓ: ${err.message} — usando texto crudo`);
            return {
                descripcionCorta: parsed.descripcion?.substring(0, 300) || '',
                descripcionLarga: parsed.descripcion || '',
                otrosNombres: parsed.titulo || '',
            };
        }
    }

    // ─── PROCESAR IMÁGENES EXISTENTES ───────────────────────────────────

    /**
     * Aplica watermark sobre una imagen existente (logo card top-right, marca centro, footer).
     * Guarda resultado en inventario/images_html/ con el mismo nombre.
     */
    async processImage(fileName: string, ideEmpr: number): Promise<{ tempFileName: string }> {
        this.ensureTempDir();
        const sourcePath = path.join(FILE_STORAGE_CONSTANTS.BASE_PATH, fileName);

        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Imagen no encontrada: ${fileName}`);
        }

        this.logger.log(`[processImage] Procesando ${fileName}...`);
        const watermark = await this.getSimpleWatermark(ideEmpr);

        const tempPath = path.join(FILE_STORAGE_CONSTANTS.IMAGES_HTML_DIR, fileName);
        await sharp(sourcePath)
            .resize(CANVAS, CANVAS, { fit: 'cover', position: 'center' })
            .composite([{ input: watermark, blend: 'over' }])
            .jpeg({ quality: 90 })
            .toFile(tempPath);

        this.logger.log(`[processImage] OK → temp/${fileName}`);
        return { tempFileName: fileName };
    }

    /**
     * Procesa imagen como portada: redimensiona, aplica logo, marca de agua central y footer navy.
     * Guarda resultado en inventario/images_html/ con el mismo nombre.
     */
    async processImagePortada(fileName: string, ideEmpr: number): Promise<{ tempFileName: string }> {
        this.ensureTempDir();
        const sourcePath = path.join(FILE_STORAGE_CONSTANTS.BASE_PATH, fileName);

        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Imagen no encontrada: ${fileName}`);
        }

        this.logger.log(`[processImagePortada] Procesando ${fileName}...`);

        // 1. Crear fondo gradiente con átomos modernos
        const bgGradient = this.buildPortadaBackgroundSvg();
        const background = await sharp({
            create: { width: CANVAS, height: CANVAS, channels: 3, background: '#F5F5F5' },
        })
            .composite([{ input: Buffer.from(bgGradient), blend: 'over' }])
            .png()
            .toBuffer();

        // 2. Redimensionar imagen original y centrar sobre el fondo
        const imageMeta = await sharp(sourcePath).metadata();
        const pw = imageMeta.width || 400;
        const ph = imageMeta.height || 400;
        const maxDim = Math.round(CANVAS * 0.82);
        const scale = Math.min(maxDim / pw, maxDim / ph, 1);
        const finalW = Math.round(pw * scale);
        const finalH = Math.round(ph * scale);
        const offsetX = Math.round((CANVAS - finalW) / 2);
        const offsetY = Math.round((CANVAS - finalH) / 2);

        const productResized = await sharp(sourcePath)
            .resize(finalW, finalH, { fit: 'fill' })
            .png()
            .toBuffer();

        const withBg = await sharp(background)
            .composite([{ input: productResized, blend: 'over', left: offsetX, top: offsetY }])
            .png()
            .toBuffer();

        this.logger.log(`  [Portada] Imagen ${pw}×${ph} → ${finalW}×${finalH} centrada en (${offsetX}, ${offsetY})`);

        // 3. Obtener datos empresa y logo
        const empresa = await this.loadEmpresaData(ideEmpr);
        const logoBuffer = await this.loadLogo(empresa.logoPath);

        const portadaComposites: sharp.OverlayOptions[] = [];

        // Centro + átomos modernos + footer navy
        const portadaOverlay = this.buildPortadaOverlaySvg(empresa.nomCorto, empresa.pagina);
        portadaComposites.push({ input: Buffer.from(portadaOverlay), blend: 'over' });

        // Logo directo sin card
        if (logoBuffer) {
            const logoNoBg = await this.removeWhiteBackground(logoBuffer);
            const logoResized = await sharp(logoNoBg)
                .resize(130, 130, { fit: 'inside' })
                .png()
                .toBuffer();
            portadaComposites.push({
                input: logoResized,
                blend: 'over',
                left: CANVAS - 150,
                top: 20,
            });
        }

        const tempPath = path.join(FILE_STORAGE_CONSTANTS.IMAGES_HTML_DIR, fileName);
        await sharp(withBg)
            .composite(portadaComposites)
            .jpeg({ quality: 90 })
            .toFile(tempPath);

        this.logger.log(`[processImagePortada] OK → temp/${fileName}`);
        return { tempFileName: fileName };
    }

    /**
     * Reemplaza la imagen original en PATH_DRIVE con la versión procesada de inventario/images_html.
     */
    async acceptImage(fileName: string): Promise<{ ok: boolean }> {
        const tempPath = path.join(FILE_STORAGE_CONSTANTS.IMAGES_HTML_DIR, fileName);
        const destPath = path.join(FILE_STORAGE_CONSTANTS.BASE_PATH, fileName);

        if (!fs.existsSync(tempPath)) {
            throw new Error(`Imagen temporal no encontrada: ${fileName}`);
        }

        fs.copyFileSync(tempPath, destPath);
        fs.unlinkSync(tempPath);

        this.logger.log(`[acceptImage] ${fileName} → reemplazada en drive, temp eliminado`);
        return { ok: true };
    }

    private generateModernAtomPattern(): string {
        // Red molecular: 3 hexágonos grandes interconectados
        const m = [
            { cx: 80,  cy: 100, r: 90, fill: '#e2e8f0', stroke: '#94a3b8' },
            { cx: 240, cy: 100, r: 85, fill: 'none',    stroke: '#94a3b8' },
            { cx: 160, cy: 240, r: 88, fill: '#e8ecf1', stroke: '#94a3b8' },
        ];

        const hex = (cx: number, cy: number, r: number) => {
            const pts: [number, number][] = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 6;
                pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
            }
            return pts;
        };

        let svg = '';
        for (const mol of m) {
            const pts = hex(mol.cx, mol.cy, mol.r);
            const ptsStr = pts.map(([x, y]) => `${x},${y}`).join(' ');
            if (mol.fill === 'none') {
                svg += `<polygon points="${ptsStr}" fill="none" stroke="${mol.stroke}" stroke-width="1.6" opacity="0.55"/>`;
            } else {
                svg += `<polygon points="${ptsStr}" fill="${mol.fill}" fill-opacity="0.30" stroke="${mol.stroke}" stroke-width="1.5" opacity="0.50"/>`;
            }
            for (const [x, y] of pts) {
                svg += `<circle cx="${x}" cy="${y}" r="5.5" fill="#64748b" opacity="0.35"/>`;
            }
            svg += `<circle cx="${mol.cx}" cy="${mol.cy}" r="7" fill="#64748b" opacity="0.40"/>`;
        }

        // Conexiones entre moléculas cercanas
        const bonds: [number, number, number, number][] = [];
        for (let i = 0; i < m.length; i++) {
            for (let j = i + 1; j < m.length; j++) {
                const dx = m[i].cx - m[j].cx;
                const dy = m[i].cy - m[j].cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 250) {
                    bonds.push([m[i].cx, m[i].cy, m[j].cx, m[j].cy]);
                }
            }
        }
        for (const [x1, y1, x2, y2] of bonds) {
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1.4" opacity="0.38"/>`;
        }

        return svg;
    }

    private buildPortadaBackgroundSvg(): string {
        return `<svg width="${CANVAS}" height="${CANVAS}" viewBox="0 0 680 900" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" opacity="0.06">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#f0f4f8"/>
      <stop offset="100%" stop-color="#e8edf2"/>
    </linearGradient>
    <radialGradient id="ra-blue" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#4ab0f5"/>
      <stop offset="55%" stop-color="#1a6fd4"/>
      <stop offset="100%" stop-color="#0b3d7a"/>
    </radialGradient>
    <radialGradient id="ra-teal" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#3de8b0"/>
      <stop offset="55%" stop-color="#0daa78"/>
      <stop offset="100%" stop-color="#05583c"/>
    </radialGradient>
    <radialGradient id="ra-cyan" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#5ae8f8"/>
      <stop offset="55%" stop-color="#0fb8d8"/>
      <stop offset="100%" stop-color="#076880"/>
    </radialGradient>
    <radialGradient id="ra-navy" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#3a7fc8"/>
      <stop offset="55%" stop-color="#1050a0"/>
      <stop offset="100%" stop-color="#082860"/>
    </radialGradient>
    <radialGradient id="ra-green" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#6affc0"/>
      <stop offset="55%" stop-color="#18d488"/>
      <stop offset="100%" stop-color="#087848"/>
    </radialGradient>
    <radialGradient id="spec" cx="38%" cy="28%" r="40%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="680" height="900" fill="url(#bg)"/>
  <line x1="148" y1="195" x2="52"  y2="118" stroke="#1a6fd4" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="148" y1="195" x2="248" y2="112" stroke="#0daa78" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="148" y1="195" x2="228" y2="298" stroke="#0fb8d8" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="148" y1="195" x2="52"  y2="300" stroke="#1a6fd4" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="148" y1="195" x2="148" y2="72"  stroke="#0daa78" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="52"  y1="118" x2="22"  y2="50"  stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="248" y1="112" x2="325" y2="55"  stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="228" y1="298" x2="308" y2="375" stroke="#0daa78" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="52"  y1="300" x2="0"   y2="370" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".35"/>
  <line x1="148" y1="72"  x2="82"  y2="20"  stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  <circle cx="148" cy="195" r="34" fill="url(#ra-blue)"/>
  <circle cx="148" cy="195" r="34" fill="url(#spec)"/>
  <circle cx="52"  cy="118" r="22" fill="url(#ra-teal)"/>
  <circle cx="52"  cy="118" r="22" fill="url(#spec)"/>
  <circle cx="248" cy="112" r="20" fill="url(#ra-cyan)"/>
  <circle cx="248" cy="112" r="20" fill="url(#spec)"/>
  <circle cx="228" cy="298" r="18" fill="url(#ra-teal)"/>
  <circle cx="228" cy="298" r="18" fill="url(#spec)"/>
  <circle cx="52"  cy="300" r="16" fill="url(#ra-blue)"/>
  <circle cx="52"  cy="300" r="16" fill="url(#spec)"/>
  <circle cx="148" cy="72"  r="20" fill="url(#ra-cyan)"/>
  <circle cx="148" cy="72"  r="20" fill="url(#spec)"/>
  <circle cx="22"  cy="50"  r="12" fill="url(#ra-navy)"/>
  <circle cx="22"  cy="50"  r="12" fill="url(#spec)"/>
  <circle cx="325" cy="55"  r="14" fill="url(#ra-green)"/>
  <circle cx="325" cy="55"  r="14" fill="url(#spec)"/>
  <circle cx="308" cy="375" r="13" fill="url(#ra-cyan)"/>
  <circle cx="308" cy="375" r="13" fill="url(#spec)"/>
  <circle cx="82"  cy="20"  r="10" fill="url(#ra-teal)"/>
  <circle cx="82"  cy="20"  r="10" fill="url(#spec)"/>
  <line x1="525" y1="180" x2="632" y2="105" stroke="#0daa78" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="525" y1="180" x2="648" y2="238" stroke="#0fb8d8" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="525" y1="180" x2="558" y2="308" stroke="#1a6fd4" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="525" y1="180" x2="408" y2="255" stroke="#0daa78" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="525" y1="180" x2="450" y2="78"  stroke="#0fb8d8" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="632" y1="105" x2="672" y2="42"  stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="648" y1="238" x2="680" y2="300" stroke="#0daa78" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="558" y1="308" x2="610" y2="398" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="408" y1="255" x2="348" y2="200" stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  <line x1="450" y1="78"  x2="395" y2="28"  stroke="#0daa78" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  <circle cx="525" cy="180" r="40" fill="url(#ra-teal)"/>
  <circle cx="525" cy="180" r="40" fill="url(#spec)"/>
  <circle cx="632" cy="105" r="24" fill="url(#ra-blue)"/>
  <circle cx="632" cy="105" r="24" fill="url(#spec)"/>
  <circle cx="648" cy="238" r="22" fill="url(#ra-cyan)"/>
  <circle cx="648" cy="238" r="22" fill="url(#spec)"/>
  <circle cx="558" cy="308" r="20" fill="url(#ra-teal)"/>
  <circle cx="558" cy="308" r="20" fill="url(#spec)"/>
  <circle cx="408" cy="255" r="18" fill="url(#ra-blue)"/>
  <circle cx="408" cy="255" r="18" fill="url(#spec)"/>
  <circle cx="450" cy="78"  r="22" fill="url(#ra-green)"/>
  <circle cx="450" cy="78"  r="22" fill="url(#spec)"/>
  <circle cx="672" cy="42"  r="13" fill="url(#ra-teal)"/>
  <circle cx="672" cy="42"  r="13" fill="url(#spec)"/>
  <circle cx="680" cy="300" r="15" fill="url(#ra-navy)"/>
  <circle cx="680" cy="300" r="15" fill="url(#spec)"/>
  <circle cx="610" cy="398" r="14" fill="url(#ra-blue)"/>
  <circle cx="610" cy="398" r="14" fill="url(#spec)"/>
  <circle cx="348" cy="200" r="13" fill="url(#ra-cyan)"/>
  <circle cx="348" cy="200" r="13" fill="url(#spec)"/>
  <circle cx="395" cy="28"  r="11" fill="url(#ra-teal)"/>
  <circle cx="395" cy="28"  r="11" fill="url(#spec)"/>
  <line x1="165" y1="510" x2="55"  y2="445" stroke="#0fb8d8" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="165" y1="510" x2="58"  y2="578" stroke="#1a6fd4" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="165" y1="510" x2="265" y2="590" stroke="#0daa78" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="165" y1="510" x2="278" y2="440" stroke="#0fb8d8" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="165" y1="510" x2="175" y2="390" stroke="#1a6fd4" stroke-width="7" stroke-linecap="round" opacity=".55"/>
  <line x1="55"  y1="445" x2="18"  y2="380" stroke="#0daa78" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="58"  y1="578" x2="18"  y2="648" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="265" y1="590" x2="308" y2="668" stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="278" y1="440" x2="352" y2="388" stroke="#0daa78" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="175" y1="390" x2="142" y2="310" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  <circle cx="165" cy="510" r="36" fill="url(#ra-cyan)"/>
  <circle cx="165" cy="510" r="36" fill="url(#spec)"/>
  <circle cx="55"  cy="445" r="22" fill="url(#ra-blue)"/>
  <circle cx="55"  cy="445" r="22" fill="url(#spec)"/>
  <circle cx="58"  cy="578" r="20" fill="url(#ra-teal)"/>
  <circle cx="58"  cy="578" r="20" fill="url(#spec)"/>
  <circle cx="265" cy="590" r="22" fill="url(#ra-blue)"/>
  <circle cx="265" cy="590" r="22" fill="url(#spec)"/>
  <circle cx="278" cy="440" r="18" fill="url(#ra-cyan)"/>
  <circle cx="278" cy="440" r="18" fill="url(#spec)"/>
  <circle cx="175" cy="390" r="17" fill="url(#ra-teal)"/>
  <circle cx="175" cy="390" r="17" fill="url(#spec)"/>
  <circle cx="18"  cy="380" r="12" fill="url(#ra-green)"/>
  <circle cx="18"  cy="380" r="12" fill="url(#spec)"/>
  <circle cx="18"  cy="648" r="13" fill="url(#ra-navy)"/>
  <circle cx="18"  cy="648" r="13" fill="url(#spec)"/>
  <circle cx="308" cy="668" r="14" fill="url(#ra-cyan)"/>
  <circle cx="308" cy="668" r="14" fill="url(#spec)"/>
  <circle cx="352" cy="388" r="12" fill="url(#ra-blue)"/>
  <circle cx="352" cy="388" r="12" fill="url(#spec)"/>
  <circle cx="142" cy="310" r="11" fill="url(#ra-teal)"/>
  <circle cx="142" cy="310" r="11" fill="url(#spec)"/>
  <line x1="530" y1="520" x2="648" y2="460" stroke="#1a6fd4" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="530" y1="520" x2="655" y2="570" stroke="#0daa78" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="530" y1="520" x2="558" y2="648" stroke="#0fb8d8" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="530" y1="520" x2="415" y2="595" stroke="#1a6fd4" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="530" y1="520" x2="410" y2="438" stroke="#0daa78" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="648" y1="460" x2="680" y2="400" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="655" y1="570" x2="680" y2="640" stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="558" y1="648" x2="608" y2="730" stroke="#0daa78" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="415" y1="595" x2="345" y2="660" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="410" y1="438" x2="348" y2="368" stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  <circle cx="530" cy="520" r="38" fill="url(#ra-blue)"/>
  <circle cx="530" cy="520" r="38" fill="url(#spec)"/>
  <circle cx="648" cy="460" r="24" fill="url(#ra-teal)"/>
  <circle cx="648" cy="460" r="24" fill="url(#spec)"/>
  <circle cx="655" cy="570" r="22" fill="url(#ra-cyan)"/>
  <circle cx="655" cy="570" r="22" fill="url(#spec)"/>
  <circle cx="558" cy="648" r="22" fill="url(#ra-teal)"/>
  <circle cx="558" cy="648" r="22" fill="url(#spec)"/>
  <circle cx="415" cy="595" r="20" fill="url(#ra-blue)"/>
  <circle cx="415" cy="595" r="20" fill="url(#spec)"/>
  <circle cx="410" cy="438" r="20" fill="url(#ra-cyan)"/>
  <circle cx="410" cy="438" r="20" fill="url(#spec)"/>
  <circle cx="680" cy="400" r="13" fill="url(#ra-green)"/>
  <circle cx="680" cy="400" r="13" fill="url(#spec)"/>
  <circle cx="680" cy="640" r="15" fill="url(#ra-navy)"/>
  <circle cx="680" cy="640" r="15" fill="url(#spec)"/>
  <circle cx="608" cy="730" r="14" fill="url(#ra-blue)"/>
  <circle cx="608" cy="730" r="14" fill="url(#spec)"/>
  <circle cx="345" cy="660" r="13" fill="url(#ra-teal)"/>
  <circle cx="345" cy="660" r="13" fill="url(#spec)"/>
  <circle cx="348" cy="368" r="13" fill="url(#ra-cyan)"/>
  <circle cx="348" cy="368" r="13" fill="url(#spec)"/>
  <line x1="325" y1="750" x2="195" y2="690" stroke="#18d488" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="325" y1="750" x2="198" y2="820" stroke="#1a6fd4" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="325" y1="750" x2="325" y2="870" stroke="#0fb8d8" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="325" y1="750" x2="455" y2="820" stroke="#18d488" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="325" y1="750" x2="448" y2="680" stroke="#1a6fd4" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  <line x1="195" y1="690" x2="112" y2="640" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="198" y1="820" x2="108" y2="865" stroke="#18d488" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="325" y1="870" x2="265" y2="900" stroke="#1a6fd4" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  <line x1="455" y1="820" x2="528" y2="875" stroke="#0fb8d8" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <line x1="448" y1="680" x2="490" y2="605" stroke="#18d488" stroke-width="5" stroke-linecap="round" opacity=".4"/>
  <circle cx="325" cy="750" r="42" fill="url(#ra-green)"/>
  <circle cx="325" cy="750" r="42" fill="url(#spec)"/>
  <circle cx="195" cy="690" r="26" fill="url(#ra-blue)"/>
  <circle cx="195" cy="690" r="26" fill="url(#spec)"/>
  <circle cx="198" cy="820" r="24" fill="url(#ra-teal)"/>
  <circle cx="198" cy="820" r="24" fill="url(#spec)"/>
  <circle cx="325" cy="870" r="22" fill="url(#ra-cyan)"/>
  <circle cx="325" cy="870" r="22" fill="url(#spec)"/>
  <circle cx="455" cy="820" r="24" fill="url(#ra-blue)"/>
  <circle cx="455" cy="820" r="24" fill="url(#spec)"/>
  <circle cx="448" cy="680" r="22" fill="url(#ra-teal)"/>
  <circle cx="448" cy="680" r="22" fill="url(#spec)"/>
  <circle cx="112" cy="640" r="14" fill="url(#ra-navy)"/>
  <circle cx="112" cy="640" r="14" fill="url(#spec)"/>
  <circle cx="108" cy="865" r="13" fill="url(#ra-green)"/>
  <circle cx="108" cy="865" r="13" fill="url(#spec)"/>
  <circle cx="528" cy="875" r="15" fill="url(#ra-cyan)"/>
  <circle cx="528" cy="875" r="15" fill="url(#spec)"/>
  <circle cx="490" cy="605" r="13" fill="url(#ra-blue)"/>
  <circle cx="490" cy="605" r="13" fill="url(#spec)"/>
  <line x1="228" y1="298" x2="278" y2="440" stroke="#0fb8d8" stroke-width="4" stroke-linecap="round" opacity=".3"/>
  <line x1="308" y1="375" x2="352" y2="388" stroke="#1a6fd4" stroke-width="4" stroke-linecap="round" opacity=".28"/>
  <line x1="558" y1="308" x2="648" y2="460" stroke="#0daa78" stroke-width="4" stroke-linecap="round" opacity=".3"/>
  <line x1="408" y1="255" x2="410" y2="438" stroke="#0fb8d8" stroke-width="4" stroke-linecap="round" opacity=".28"/>
  <line x1="265" y1="590" x2="345" y2="660" stroke="#1a6fd4" stroke-width="4" stroke-linecap="round" opacity=".3"/>
  <line x1="610" y1="398" x2="655" y2="570" stroke="#0daa78" stroke-width="4" stroke-linecap="round" opacity=".28"/>
  <line x1="308" y1="668" x2="415" y2="595" stroke="#0fb8d8" stroke-width="4" stroke-linecap="round" opacity=".3"/>
  <line x1="195" y1="690" x2="112" y2="640" stroke="#0daa78" stroke-width="3" stroke-linecap="round" opacity=".22"/>
</svg>`;
    }

    private buildPortadaOverlaySvg(nomCorto: string, pagina: string): string {
        const centerText = nomCorto ? this.buildCenterWatermarkSvg(nomCorto) : '';
        const footer = pagina ? this.buildPortadaFooterSvg(pagina) : '';

        return `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
            ${centerText}
            ${footer}
        </svg>`;
    }

    private buildPortadaFooterSvg(pagina: string): string {
        return `<g>
            <rect x="0" y="${CANVAS - 65}" width="${CANVAS}" height="65" fill="#1a2744"/>
            <text x="${CANVAS / 2}" y="${CANVAS - 25}" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif" font-size="20" font-weight="600" fill="#ffffff" opacity="0.90" letter-spacing="2">${this.escapeXml(pagina)}</text>
        </g>`;
    }

    /**
     * Quita el fondo detectando el color dominante de los bordes.
     * Funciona con cualquier color de fondo (blanco, verde, azul, etc.).
     */
    private async removeBackground(imageBuffer: Buffer): Promise<Buffer> {
        const resized = await sharp(imageBuffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const { data, info } = resized;

        const bgSamples: Array<{ r: number; g: number; b: number }> = [];
        const step = 5;
        for (let x = 0; x < info.width; x += step) {
            for (let y = 0; y < 8; y += 2) {
                const i = (y * info.width + x) * 4;
                bgSamples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
                const j = ((info.height - 1 - y) * info.width + x) * 4;
                bgSamples.push({ r: data[j], g: data[j + 1], b: data[j + 2] });
            }
        }
        for (let y = 8; y < info.height - 8; y += step) {
            for (let x = 0; x < 8; x += 2) {
                const i = (y * info.width + x) * 4;
                bgSamples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
                const j = (y * info.width + (info.width - 1 - x)) * 4;
                bgSamples.push({ r: data[j], g: data[j + 1], b: data[j + 2] });
            }
        }

        const bg = {
            r: Math.round(bgSamples.reduce((s, c) => s + c.r, 0) / bgSamples.length),
            g: Math.round(bgSamples.reduce((s, c) => s + c.g, 0) / bgSamples.length),
            b: Math.round(bgSamples.reduce((s, c) => s + c.b, 0) / bgSamples.length),
        };

        const threshold = 50;
        for (let i = 0; i < data.length; i += 4) {
            const dist = Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b);
            if (dist < threshold) {
                data[i + 3] = 0;
            } else if (dist < threshold * 2) {
                data[i + 3] = Math.round((dist - threshold) / threshold * 255);
            }
        }

        return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    }

    // ─── UTILIDADES ─────────────────────────────────────────────────────

    private ensureTempDir(): void {
        const dir = FILE_STORAGE_CONSTANTS.IMAGES_HTML_DIR;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}
