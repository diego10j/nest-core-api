import sharp from 'sharp';

import { FormatoDato, TablaChat } from '../helpers/presentacion.helper';

const FUENTE = 'Helvetica, Arial, sans-serif';
const TAM = 13;
const ALTO_FILA = 28;
const PAD = 12;
const NUMERICOS: FormatoDato[] = ['numero', 'cantidad', 'moneda', 'precio', 'porcentaje', 'dias'];

const escaparXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Valor de una celda como texto (mismo formato que el chat: en-US, $ con 2 decimales). */
export function textoCelda(v: unknown, formato?: FormatoDato): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) && formato && NUMERICOS.includes(formato))) {
    const x = Number(v);
    switch (formato) {
      case 'moneda':
      case 'precio':
        return `${x < 0 ? '-' : ''}$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(x))}`;
      case 'porcentaje':
        return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(x)}%`;
      case 'cantidad':
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(x);
      default:
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(x);
    }
  }
  return String(v);
}

/** Ancho aproximado del texto en píxeles (Helvetica 13px; dígitos y mayúsculas más anchos). */
function anchoTexto(t: string, negrita = false): number {
  let w = 0;
  for (const ch of t) w += /[A-ZÁÉÍÓÚÑ$%0-9]/.test(ch) ? 8.2 : /[ .,:;'|il]/.test(ch) ? 3.8 : 7;
  return w * (negrita ? 1.06 : 1);
}

/**
 * Tabla → PNG (sin navegador): SVG armado a mano y convertido con sharp a doble resolución. Se usa
 * en Telegram, donde una tabla de muchas columnas en texto no se lee bien en el celular.
 * Números alineados a la derecha, filas alternadas y fila de totales en negrita.
 */
export async function tablaAPng(t: TablaChat): Promise<Buffer> {
  const filas = t.filas.map((f) => t.columnas.map((c) => textoCelda(f[c.clave], c.formato)));
  const total = t.total ? t.columnas.map((c) => textoCelda(t.total![c.clave], c.formato)) : null;
  const anchos = t.columnas.map((c, i) =>
    Math.ceil(
      Math.max(anchoTexto(c.etiqueta, true), ...filas.map((f) => anchoTexto(f[i])), total ? anchoTexto(total[i], true) : 0) + PAD * 2,
    ),
  );
  const anchoTabla = anchos.reduce((a, b) => a + b, 0);
  const ancho = Math.max(anchoTabla + 32, anchoTexto(t.titulo, true) * 1.25 + 40);
  const yTabla = t.subtitulo ? 64 : 48;
  const nFilas = 1 + filas.length + (total ? 1 : 0);
  const alto = yTabla + nFilas * ALTO_FILA + 18;
  const x0 = 16;
  const derecha = t.columnas.map((c) => !!c.formato && NUMERICOS.includes(c.formato));

  const celdas = (valores: string[], y: number, negrita: boolean, color = '#1C252E') => {
    let x = x0;
    return valores
      .map((v, i) => {
        const tx = derecha[i] ? x + anchos[i] - PAD : x + PAD;
        const el = `<text x="${tx}" y="${y + ALTO_FILA / 2 + 4.5}" text-anchor="${derecha[i] ? 'end' : 'start'}" font-size="${TAM}" font-weight="${negrita ? 700 : 400}" fill="${color}">${escaparXml(v)}</text>`;
        x += anchos[i];
        return el;
      })
      .join('');
  };

  const partes: string[] = [
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${x0}" y="28" font-size="17" font-weight="700" fill="#1C252E">${escaparXml(t.titulo)}</text>`,
    t.subtitulo ? `<text x="${x0}" y="48" font-size="12" fill="#637381">${escaparXml(t.subtitulo)}</text>` : '',
    `<rect x="${x0}" y="${yTabla}" width="${anchoTabla}" height="${ALTO_FILA}" fill="#F4F6F8"/>`,
    celdas(
      t.columnas.map((c) => c.etiqueta),
      yTabla,
      true,
      '#454F5B',
    ),
  ];
  filas.forEach((f, i) => {
    const y = yTabla + (i + 1) * ALTO_FILA;
    if (i % 2 === 1) partes.push(`<rect x="${x0}" y="${y}" width="${anchoTabla}" height="${ALTO_FILA}" fill="#FAFBFC"/>`);
    partes.push(`<line x1="${x0}" y1="${y}" x2="${x0 + anchoTabla}" y2="${y}" stroke="#EDEFF2"/>`, celdas(f, y, false));
  });
  if (total) {
    const y = yTabla + (filas.length + 1) * ALTO_FILA;
    partes.push(
      `<rect x="${x0}" y="${y}" width="${anchoTabla}" height="${ALTO_FILA}" fill="#E9F7F1"/>`,
      `<line x1="${x0}" y1="${y}" x2="${x0 + anchoTabla}" y2="${y}" stroke="#00A76F"/>`,
      celdas(total, y, true),
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(ancho)}" height="${alto}" font-family="${FUENTE}">${partes.join('')}</svg>`;
  return sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
}
