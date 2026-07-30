import fs from 'node:fs';
import path from 'node:path';

import type { Content, StyleDictionary } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { fDate } from 'src/util/helpers/date-util';
import { getStaticImage } from 'src/util/helpers/file-utils';

/**
 * Estilos, paleta y helpers compartidos por los reportes RIDE (comprobantes electrónicos
 * SRI: factura, retención, liquidación de compra, nota de crédito, guía de remisión).
 * Puerto/extracción del estilo ya validado en factura.report.ts, reutilizado para no
 * duplicar la misma tabla de estilos y el mismo encabezado (logo + datos emisor + panel
 * de autorización/clave de acceso) en cada tipo de comprobante nuevo.
 */

// ── Paleta ────────────────────────────────────────────────────────────────
export const RIDE_COLOR = {
    grisTh: '#e8e8e8',
    grisFila: '#f7f7f7',
    grisLinea: '#cccccc',
    negro: '#1a1a1a',
    blanco: '#ffffff',
    grisTexto: '#666666',
    grisClaro: '#fafafa',
    azul: '#2563eb',
};

// ── Estilos ───────────────────────────────────────────────────────────────
export const rideStyles: StyleDictionary = {
    panelLabel: { fontSize: 7.5, bold: true, color: RIDE_COLOR.grisTexto },
    panelValue: { fontSize: 7.5, color: RIDE_COLOR.negro },
    comprobanteTitle: { fontSize: 14, bold: true, color: RIDE_COLOR.negro },
    comprobanteNumero: { fontSize: 11, bold: true, color: RIDE_COLOR.negro, alignment: 'right' },
    authLabel: { fontSize: 7, bold: true, color: RIDE_COLOR.grisTexto, margin: [0, 3, 0, 1] as [number, number, number, number] },
    authValue: { fontSize: 7.5, color: RIDE_COLOR.negro, margin: [0, 0, 0, 2] as [number, number, number, number] },
    claveAccesoText: { fontSize: 6.5, color: RIDE_COLOR.grisTexto, characterSpacing: 0.8, alignment: 'center' },
    campoLabel: { fontSize: 7.5, bold: true, color: RIDE_COLOR.grisTexto },
    campoValor: { fontSize: 7.5, color: RIDE_COLOR.negro },
    thTexto: { fontSize: 7.5, bold: true, color: RIDE_COLOR.blanco, alignment: 'center' },
    tdTexto: { fontSize: 7.5, color: RIDE_COLOR.negro },
    sectionTitle: { fontSize: 9, bold: true, color: RIDE_COLOR.negro, margin: [0, 0, 0, 6] as [number, number, number, number] },
    sectionSubtitle: { fontSize: 8, bold: true, color: RIDE_COLOR.grisTexto, margin: [0, 0, 0, 4] as [number, number, number, number] },
    totalLabel: { fontSize: 8, color: RIDE_COLOR.negro, alignment: 'left', margin: [4, 2, 4, 2] as [number, number, number, number] },
    totalValor: { fontSize: 8, color: RIDE_COLOR.negro, alignment: 'right', margin: [4, 2, 4, 2] as [number, number, number, number] },
    totalGrandLabel: { fontSize: 10, bold: true, color: RIDE_COLOR.negro, alignment: 'left', margin: [4, 4, 4, 4] as [number, number, number, number] },
    totalGrandValor: { fontSize: 10, bold: true, color: RIDE_COLOR.negro, alignment: 'right', margin: [4, 4, 4, 4] as [number, number, number, number] },
};

// ── Helpers de formato ──────────────────────────────────────────────────────
export const pad = (v: string | number, n: number): string => String(v ?? '').padStart(n, '0');

export const fmtNumero = (e: string, p: string, s: string): string =>
    `${pad(e, 3)}-${pad(p, 3)}-${pad(s, 9)}`;

/**
 * Separa un número de documento en establecimiento/ptoEmisión/secuencial. Soporta tanto el
 * formato con guiones ("001-001-000000001") como el heredado sin separador (dígitos
 * contiguos, ancho fijo 3+3+resto) usado por retención (numero_cncre) y algunos CxP.
 */
export function splitNumeroDocumento(numero: string | null | undefined): { estab: string; ptoEmi: string; secuencial: string } {
    const limpio = (numero ?? '').trim();
    if (limpio.includes('-')) {
        const partes = limpio.split('-');
        if (partes.length === 3) {
            return { estab: partes[0], ptoEmi: partes[1], secuencial: partes[2] };
        }
    }
    return { estab: limpio.slice(0, 3), ptoEmi: limpio.slice(3, 6), secuencial: limpio.slice(6) };
}

export const th = (text: string, align: 'left' | 'center' | 'right' = 'center'): object => ({
    text,
    style: 'thTexto',
    alignment: align,
    fillColor: RIDE_COLOR.negro,
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    margin: [4, 5, 4, 5] as [number, number, number, number],
});

export const td = (
    text: string | number,
    fill: string,
    align: 'left' | 'center' | 'right' = 'left',
    bold = false,
): object => ({
    text: String(text),
    fontSize: 7.5,
    color: RIDE_COLOR.negro,
    bold,
    alignment: align,
    fillColor: fill,
    border: [false, false, false, true] as [boolean, boolean, boolean, boolean],
    borderColor: ['', '', '', RIDE_COLOR.grisLinea] as [string, string, string, string],
    margin: [4, 3, 4, 3] as [number, number, number, number],
});

const VALID_IMG_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MIME_MAP: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

export function getImageDataUrl(filePath: string): string | null {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    if (!VALID_IMG_EXTS.includes(ext)) return null;
    try {
        const buffer = fs.readFileSync(filePath);
        return `data:${MIME_MAP[ext] || 'image/png'};base64,${buffer.toString('base64')}`;
    } catch {
        return null;
    }
}

export function getEmpresaLogoDataUrl(empresa: Empresa): string | null {
    try {
        return getImageDataUrl(getStaticImage(empresa.logotipo_empr || 'no-image'));
    } catch {
        return null;
    }
}

export interface EncabezadoRideParams {
    /** Título del comprobante, ej. "FACTURA", "COMPROBANTE DE RETENCIÓN", "LIQUIDACIÓN DE COMPRA". */
    titulo: string;
    /** Número completo estab-ptoEmi-secuencial, ya formateado. */
    numero: string;
    empresa: Empresa;
    claveAcceso?: string;
    numeroAutorizacion?: string;
    fechaAutorizacion?: Date | string | null;
    barcodeDataUrl?: string;
    /** "PRODUCCIÓN" / "PRUEBAS", según sri_emisor.ambiente_sremi de la sucursal emisora (ver ambienteRideTexto). */
    ambiente?: string;
    /** "R.U.C.:" a la izquierda es siempre el emisor; alguna vez el label difiere (ej. proveedor en liquidación de compra) — no aplica aquí, el panel izquierdo es siempre el emisor del comprobante. */
}

/**
 * Texto de ambiente para el encabezado RIDE, a partir de sri_emisor.ambiente_sremi (EmisorDto.ambiente):
 * 1 = pruebas, 2 = producción (mismo criterio que el XML <infoTributaria><ambiente> y buildXmlAutorizacion).
 */
export function ambienteRideTexto(ambiente: number | null | undefined): string {
    if (ambiente === 2) return 'PRODUCCIÓN';
    if (ambiente === 1) return 'PRUEBAS';
    return '---';
}

/**
 * Encabezado RIDE estándar: panel izquierdo (logo + datos del emisor) + panel derecho
 * (título, autorización, ambiente/emisión, clave de acceso + barcode). Idéntico en
 * estructura al de factura.report.ts, parametrizado para los demás tipos de comprobante.
 */
export function buildEncabezadoRide(params: EncabezadoRideParams): Content {
    const { titulo, numero, empresa, claveAcceso, numeroAutorizacion, fechaAutorizacion, barcodeDataUrl, ambiente } = params;
    const empresaLogoDataUrl = getEmpresaLogoDataUrl(empresa);

    const colEmpresa: Content = {
        stack: [
            ...(empresaLogoDataUrl
                ? [{
                    image: empresaLogoDataUrl,
                    width: 100,
                    height: 100,
                    fit: [100, 100] as [number, number],
                    alignment: 'center' as const,
                    margin: [0, 6, 0, 8] as [number, number, number, number],
                }]
                : []),
            {
                columns: [
                    { text: 'Emisor: ', style: 'panelLabel', width: 'auto' },
                    { text: empresa.nom_empr ?? '', style: 'panelValue', width: '*' },
                ],
                margin: [0, 1, 0, 1] as [number, number, number, number],
            },
            {
                columns: [
                    { text: 'RUC: ', style: 'panelLabel', width: 'auto' },
                    { text: empresa.identificacion_empr ?? '', style: 'panelValue', width: '*' },
                ],
                margin: [0, 1, 0, 1] as [number, number, number, number],
            },
            ...(empresa.direccion_empr
                ? [{
                    columns: [
                        { text: 'Matriz: ', style: 'panelLabel', width: 'auto' },
                        { text: empresa.direccion_empr, style: 'panelValue', width: '*' },
                    ],
                    margin: [0, 1, 0, 1] as [number, number, number, number],
                }]
                : []),
            ...(empresa.mail_empr
                ? [{
                    columns: [
                        { text: 'Correo: ', style: 'panelLabel', width: 'auto' },
                        { text: empresa.mail_empr, style: 'panelValue', width: '*' },
                    ],
                    margin: [0, 1, 0, 1] as [number, number, number, number],
                }]
                : []),
            ...(empresa.telefono_empr
                ? [{
                    columns: [
                        { text: 'Teléfono: ', style: 'panelLabel', width: 'auto' },
                        { text: empresa.telefono_empr, style: 'panelValue', width: '*' },
                    ],
                    margin: [0, 1, 0, 1] as [number, number, number, number],
                }]
                : []),
        ],
        fillColor: RIDE_COLOR.blanco,
        margin: [0, 0, 0, 0] as [number, number, number, number],
    };

    const colComprobante: Content = {
        stack: [
            {
                columns: [
                    { text: titulo, style: 'comprobanteTitle', width: '*' },
                    { text: `No.${numero}`, style: 'comprobanteNumero', width: 'auto' },
                ],
                margin: [0, 6, 0, 8] as [number, number, number, number],
            },
            ...(numeroAutorizacion
                ? [
                    { text: 'Número de Autorización:', style: 'authLabel' },
                    { text: numeroAutorizacion, style: 'authValue' },
                    { text: 'Fecha y hora de Autorización:', style: 'authLabel' },
                    {
                        text: fechaAutorizacion ? fDate(fechaAutorizacion, 'dd/MM/yyyy HH:mm:ss') : '',
                        style: 'authValue',
                    },
                ]
                : [
                    { text: ' ', margin: [0, 12, 0, 0] as [number, number, number, number] },
                ]),
            {
                columns: [
                    { stack: [{ text: 'Ambiente:', style: 'authLabel' }, { text: ambiente ?? '---', style: 'authValue' }], width: '50%' },
                    { stack: [{ text: 'Emisión:', style: 'authLabel' }, { text: 'NORMAL', style: 'authValue' }], width: '50%' },
                ],
            },
            ...(claveAcceso
                ? [
                    { text: 'Clave de Acceso:', style: 'authLabel' },
                    ...(barcodeDataUrl
                        ? [
                            {
                                image: barcodeDataUrl,
                                width: 250,
                                height: 45,
                                alignment: 'center' as const,
                                margin: [0, 2, 0, 2] as [number, number, number, number],
                            },
                            { text: claveAcceso, style: 'claveAccesoText', margin: [0, 0, 0, 4] as [number, number, number, number] },
                        ]
                        : [
                            { text: claveAcceso, style: 'claveAccesoText', margin: [0, 2, 0, 4] as [number, number, number, number] },
                        ]),
                ]
                : []),
        ],
        margin: [10, 0, 0, 0] as [number, number, number, number],
    };

    return {
        table: {
            widths: ['42%', '58%'],
            body: [
                [
                    {
                        ...colEmpresa,
                        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: [RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string],
                        fillColor: RIDE_COLOR.blanco,
                        margin: [8, 0, 8, 8] as [number, number, number, number],
                    },
                    {
                        ...colComprobante,
                        border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: ['', RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string],
                        fillColor: RIDE_COLOR.grisClaro,
                        margin: [10, 0, 8, 8] as [number, number, number, number],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            hLineColor: () => RIDE_COLOR.grisLinea,
            vLineColor: () => RIDE_COLOR.grisLinea,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };
}

/** Panel de 2 columnas para datos del contraparte (cliente/proveedor/destinatario), estilo factura.report.ts. */
export function buildPanelContraparte(izquierda: object[], derecha: object[]): Content {
    return {
        table: {
            widths: ['*', '*'],
            body: [
                [
                    {
                        stack: izquierda,
                        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: [RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string],
                        fillColor: RIDE_COLOR.blanco,
                        margin: [6, 5, 6, 5] as [number, number, number, number],
                    },
                    {
                        stack: derecha,
                        border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: ['', RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string],
                        fillColor: RIDE_COLOR.blanco,
                        margin: [6, 5, 6, 5] as [number, number, number, number],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            hLineColor: () => RIDE_COLOR.grisLinea,
            vLineColor: () => RIDE_COLOR.grisLinea,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };
}

/** Línea "Label: valor" usada dentro de los paneles de contraparte. */
export function campoTexto(label: string, valor: string): object {
    return {
        columns: [
            { text: `${label}:`, style: 'campoLabel', width: 'auto' },
            { text: ` ${valor || '---'}`, style: 'campoValor', width: '*' },
        ],
        margin: [0, 1.5, 0, 1.5] as [number, number, number, number],
    };
}

/** Sección "Información Adicional" (campoAdicional nombre/valor), estilo factura.report.ts. */
export function buildInfoAdicionalSection(campos: Array<{ nombre: string; valor?: string | null }>): Content {
    const rows = campos
        .filter((c) => !!c.valor)
        .map((c) => [
            { text: `${c.nombre}:`, fontSize: 7.5, bold: true, color: RIDE_COLOR.grisTexto, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], width: '30%' },
            { text: c.valor as string, fontSize: 7.5, color: RIDE_COLOR.negro, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
        ]);

    return {
        stack: [
            { text: 'Información Adicional', style: 'sectionTitle' },
            ...(rows.length > 0
                ? [{
                    table: { widths: ['30%', '*'], body: rows },
                    layout: 'noBorders',
                    margin: [0, 0, 0, 0] as [number, number, number, number],
                } as Content]
                : []),
        ],
    };
}
