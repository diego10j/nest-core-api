import type { Content, ContentTable, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';

import { ProformaRep, ProformaRepDetalle } from './interfaces/proforma-rep';
import { fNumber } from 'src/util/helpers/number-util';

// ─── Paleta neutral y profesional ────────────────────────────────────────────
const C = {
    // Estructura
    black: '#0f1117',
    ink: '#1a1d27',
    body: '#374151',
    muted: '#6b7280',
    placeholder: '#9ca3af',
    rule: '#e5e7eb',
    bg: '#f9fafb',
    white: '#ffffff',

    // Acento único: un azul oscuro sobrio
    accent: '#1e3a5f',
    accentMid: '#2d5282',
    accentSoft: '#ebf0f7',

    // Estados (solo texto, sin fondos llamativos)
    success: '#166534',
    warning: '#92400e',
    danger: '#991b1b',
};

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles: StyleDictionary = {
    // Encabezado hero
    eyebrow: {
        fontSize: 8,
        bold: true,
        color: C.muted,
        characterSpacing: 1.5,
    },
    docTitle: {
        fontSize: 22,
        bold: true,
        color: C.accent,
    },
    docSubtitle: {
        fontSize: 9,
        color: C.muted,
    },
    // Secciones
    sectionTitle: {
        fontSize: 9,
        bold: true,
        color: C.accent,
        characterSpacing: 0.8,
    },
    // Campos
    label: {
        fontSize: 7.5,
        color: C.placeholder,
        bold: true,
        characterSpacing: 0.5,
    },
    value: {
        fontSize: 9,
        color: C.body,
    },
    valueStrong: {
        fontSize: 9,
        bold: true,
        color: C.ink,
    },
    // Tabla
    tableHeader: {
        fontSize: 8,
        bold: true,
        color: C.accent,
    },
    tableCell: {
        fontSize: 8.5,
        color: C.body,
    },
    tableCellMuted: {
        fontSize: 8,
        color: C.muted,
    },
    // Totales
    totalLabel: {
        fontSize: 9,
        color: C.muted,
    },
    totalValue: {
        fontSize: 9,
        color: C.body,
        alignment: 'right',
    },
    grandLabel: {
        fontSize: 10,
        bold: true,
        color: C.accent,
    },
    grandValue: {
        fontSize: 13,
        bold: true,
        color: C.accent,
        alignment: 'right',
    },
    // Notas
    noteText: {
        fontSize: 8.5,
        color: C.body,
        lineHeight: 1.4,
    },
    // Badge inline
    badge: {
        fontSize: 8,
        bold: true,
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safeText = (value: unknown, fallback = '—'): string => {
    if (value === null || value === undefined) return fallback;
    const t = String(value).trim();
    return t === '' ? fallback : t;
};

const money = (v: unknown) => fCurrency(Number(v || 0));
const pct = (v: unknown) => `${Number(v || 0).toFixed(0)}%`;

const unitPrice = (v: unknown): string => {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0.00';

    // Base en 4 decimales para preservar precisión de BDD.
    const rounded4 = n.toFixed(4);
    const decimals = rounded4.split('.')[1] || '0000';

    // Si los últimos dos decimales son 00, mostrar solo 2 decimales.
    if (decimals.endsWith('00')) {
        return n.toFixed(2);
    }

    return rounded4;
};

/** Línea divisora horizontal */
const divider = (margin: [number, number, number, number] = [0, 8, 0, 8]): Content => ({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 527, y2: 0, lineWidth: 0.5, lineColor: C.rule }],
    margin,
});

/** Pequeña etiqueta de estado solo con color de texto */
const statusBadge = (text: string, color: string): Content => ({
    text,
    style: 'badge',
    color,
});

/** Campo label + valor */
const field = (label: string, value: unknown, strong = false): Content => ({
    stack: [
        { text: label.toUpperCase(), style: 'label', margin: [0, 0, 0, 1] as [number, number, number, number] },
        { text: safeText(value), style: strong ? 'valueStrong' : 'value', margin: [0, 0, 0, 0] as [number, number, number, number] },
    ],
    margin: [0, 0, 0, 10] as [number, number, number, number],
});

/** Título de sección con línea abajo */
const sectionHeading = (title: string): Content => ({
    stack: [
        { text: title.toUpperCase(), style: 'sectionTitle', margin: [0, 0, 0, 6] as [number, number, number, number] },
        {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 527, y2: 0, lineWidth: 1, lineColor: C.accentSoft }],
            margin: [0, 0, 0, 10] as [number, number, number, number],
        },
    ],
});

/** Descripción de línea de detalle */
const buildDesc = (d: ProformaRepDetalle): string =>
    [safeText(d.observacion_ccdpr, '')]
        .filter(Boolean)
        .join('\n');

const qtyWithUnit = (d: ProformaRepDetalle): string => {
    const raw = d.cantidad_ccdpr;
    const unit = safeText(d.siglas_inuni, '').trim();

    if (raw === null || raw === undefined) {
        return unit ? `0 ${unit}` : '0';
    }

    const text = String(raw).trim();
    if (text === '') {
        return unit ? `0 ${unit}` : '0';
    }

    // Si ya viene como "1 kg" desde backend, se respeta tal cual.
    if (/[a-zA-Z]/.test(text)) {
        return text;
    }

    return unit ? `${text} ${unit}` : text;
};

// ─── Tabla de detalles ────────────────────────────────────────────────────────
const detailTable = (detalles: ProformaRepDetalle[]): ContentTable => ({
    table: {
        headerRows: 1,
        widths: ['*', 72, 72, 72],
        body: [
            // Cabeceras
            [
                { text: 'Descripción', style: 'tableHeader', border: [false, false, false, true] as [boolean, boolean, boolean, boolean], borderColor: ['', '', '', C.accentSoft] as [string, string, string, string], margin: [0, 0, 0, 5] as [number, number, number, number] },
                { text: 'Cantidad', style: 'tableHeader', border: [false, false, false, true] as [boolean, boolean, boolean, boolean], borderColor: ['', '', '', C.accentSoft] as [string, string, string, string], margin: [0, 0, 0, 5] as [number, number, number, number], alignment: 'left' },
                { text: 'P. Unit.', style: 'tableHeader', border: [false, false, false, true] as [boolean, boolean, boolean, boolean], borderColor: ['', '', '', C.accentSoft] as [string, string, string, string], margin: [0, 0, 0, 5] as [number, number, number, number], alignment: 'right' },
                { text: 'Subtotal', style: 'tableHeader', border: [false, false, false, true] as [boolean, boolean, boolean, boolean], borderColor: ['', '', '', C.accentSoft] as [string, string, string, string], margin: [0, 0, 0, 5] as [number, number, number, number], alignment: 'right' },
            ],
            // Filas
            ...detalles.map((d, i) => {
                const fill = i % 2 === 0 ? C.white : C.bg;
                const cell = (
                    text: string,
                    style: string = 'tableCell',
                    alignment: string = 'left',
                    extra: object = {},
                ) => ({
                    text,
                    style,
                    alignment,
                    fillColor: fill,
                    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                    margin: [0, 5, 0, 5] as [number, number, number, number],
                    ...extra,
                });
                return [
                    cell(buildDesc(d), 'tableCell', 'left'),
                    cell(qtyWithUnit(d), 'tableCell', 'left'),
                    cell(unitPrice(d.precio_ccdpr), 'tableCell', 'right'),
                    cell(money(d.total_ccdpr), 'tableCell', 'right', { bold: true, color: C.ink }),
                ];
            }),
        ],
    },
    layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingBottom: () => 0,
        paddingTop: () => 0,
        paddingLeft: () => 5,
        paddingRight: () => 5,
    },
});

// ─── Documento principal ──────────────────────────────────────────────────────
export const proformaReport = (proforma: ProformaRep, header: Content): TDocumentDefinitions => {
    const { cabecera, detalles } = proforma;

    const subtotal = Number(cabecera.base_grabada_cccpr || 0) + Number(cabecera.base_tarifa0_cccpr || 0);

    // Estado como texto con color
    const estadoColor = cabecera.anulado_cccpr ? C.danger : cabecera.enviado_cccpr ? C.success : C.warning;
    const estadoText = '';  // cabecera.anulado_cccpr ? 'ANULADA' : cabecera.enviado_cccpr ? 'VIGENTE' : 'BORRADOR';

    // ── Hero / Cabecera del documento ─────────────────────────────────────────
    const heroSection: Content = {
        columns: [
            {
                width: '*',
                stack: [
                    { text: 'PROPUESTA COMERCIAL', style: 'eyebrow', margin: [0, 0, 0, 4] as [number, number, number, number] },
                    { text: `Proforma N.° ${safeText(cabecera.secuencial_cccpr, 'S/N')}`, style: 'docTitle', margin: [0, 0, 0, 4] as [number, number, number, number] },
                    {
                        columns: [
                            { text: `Fecha de emisión: ${fDate(cabecera.fecha_cccpr)}`, style: 'docSubtitle', width: 'auto' },
                            { text: '  ·  ', style: 'docSubtitle', width: 'auto', color: C.rule },
                            { text: safeText(cabecera.nombre_cctpr, ''), style: 'docSubtitle', width: 'auto' },
                            { text: '  ·  ', style: 'docSubtitle', width: 'auto', color: C.rule },
                            statusBadge(estadoText, estadoColor),
                        ],
                    },
                ],
            },
            {
                width: 'auto',
                stack: [
                    { text: 'TOTAL', style: 'eyebrow', alignment: 'right', margin: [0, 0, 0, 4] as [number, number, number, number] },
                    { text: money(cabecera.total_cccpr), fontSize: 20, bold: true, color: C.accent, alignment: 'right' },
                    { text: `IVA incluido (${pct(cabecera.tarifa_iva_cccpr)})`, style: 'docSubtitle', alignment: 'right', margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                alignment: 'right',
            },
        ],
        columnGap: 20,
        margin: [0, 0, 0, 0] as [number, number, number, number],
    };

    // ── Cliente ───────────────────────────────────────────────────────────────
    const clienteSection: Content = {
        stack: [
            sectionHeading('Datos del cliente'),
            {
                columns: [
                    { width: '33%', stack: [field('Razón social / Nombre', cabecera.solicitante_cccpr, true)] },
                    { width: '33%', stack: [field('Identificación', `${safeText(cabecera.nombre_getid, '')} ${safeText(cabecera.identificac_cccpr, '—')}`.trim())] },
                    { width: '34%', stack: [field('Dirección', cabecera.direccion_cccpr)] },
                ],
                columnGap: 16,
            },
            {
                columns: [
                    { width: '33%', stack: [field('Contacto', cabecera.contacto_cccpr)] },
                    { width: '33%', stack: [field('Teléfono', cabecera.telefono_cccpr)] },
                    { width: '34%', stack: [field('Correo electrónico', cabecera.correo_cccpr)] },
                ],
                columnGap: 16,
            },
        ],
        margin: [0, 0, 0, 14] as [number, number, number, number],
    };

    // ── Condiciones comerciales ───────────────────────────────────────────────
    const condicionesSection: Content = {
        stack: [
            sectionHeading('Condiciones comerciales'),
            {
                columns: [
                    { width: '33%', stack: [field('Asesor comercial', cabecera.nombre_vgven, true)] },
                    { width: '33%', stack: [field('Validez de la oferta', cabecera.nombre_ccvap)] },
                    { width: '34%', stack: [field('Tiempo de entrega', cabecera.nombre_ccten)] },
                ],
                columnGap: 16,
            },
        ],
        margin: [0, 0, 0, 14] as [number, number, number, number],
    };

    // ── Detalle ───────────────────────────────────────────────────────────────
    const detalleSection: Content = {
        stack: [
            sectionHeading('Detalle de productos / servicios'),
            detailTable(detalles),
        ],
        margin: [0, 0, 0, 14] as [number, number, number, number],
    };

    // ── Totales + Observaciones (dos columnas) ────────────────────────────────
    const totalesBlock: Content = {
        stack: [
            sectionHeading('Resumen'),
            {
                table: {
                    widths: ['*', 90],
                    body: [
                        [
                            { text: 'Base tarifa 0%', style: 'totalLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                            { text: money(cabecera.base_tarifa0_cccpr), style: 'totalValue', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                        ],
                        [
                            { text: `Base gravada ${pct(cabecera.tarifa_iva_cccpr)}`, style: 'totalLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                            { text: money(cabecera.base_grabada_cccpr), style: 'totalValue', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                        ],
                        [
                            { text: `IVA ${pct(cabecera.tarifa_iva_cccpr)}`, style: 'totalLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                            { text: money(cabecera.valor_iva_cccpr), style: 'totalValue', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                        ],
                        [
                            {
                                text: 'TOTAL',
                                style: 'grandLabel',
                                border: [false, true, false, false] as [boolean, boolean, boolean, boolean],
                                borderColor: ['', '', C.rule, ''] as [string, string, string, string],
                                margin: [0, 8, 0, 0] as [number, number, number, number],
                            },
                            {
                                text: money(cabecera.total_cccpr),
                                style: 'grandValue',
                                border: [false, true, false, false] as [boolean, boolean, boolean, boolean],
                                borderColor: ['', '', C.rule, ''] as [string, string, string, string],
                                margin: [0, 8, 0, 0] as [number, number, number, number],
                            },
                        ],
                    ],
                },
                layout: 'noBorders',
            },
        ],
    };

    const observacionesBlock: Content = {
        stack: [
            sectionHeading('Observaciones'),
            { text: safeText(cabecera.observacion_cccpr, 'Sin observaciones adicionales.'), style: 'noteText' },
        ],
    };

    const bottomRow: Content = {
        columns: [
            { width: '55%', stack: [observacionesBlock] },
            { width: '45%', stack: [totalesBlock] },
        ],
        columnGap: 20,
        margin: [0, 0, 0, 0] as [number, number, number, number],
    };

    // ─────────────────────────────────────────────────────────────────────────
    return {
        styles,
        pageSize: 'A4',
        pageMargins: [38, 22, 38, 30] as [number, number, number, number],

        watermark: cabecera.anulado_cccpr
            ? { text: 'ANULADA', color: C.danger, opacity: 0.06, bold: true }
            : undefined,

        footer: (currentPage: number, pageCount: number) =>
            footerSection(currentPage, pageCount, true),

        content: [
            header,
            heroSection,
            divider([0, 14, 0, 16]),
            clienteSection,
            condicionesSection,
            detalleSection,
            bottomRow,
        ],
    };
};