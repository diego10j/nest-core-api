import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';

import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate } from 'src/util/helpers/date-util';

import { ComprobanteContabilidadData } from './interfaces/comprobante-contabilidad-rep';

const C = {
    ink: '#111827',
    body: '#374151',
    muted: '#6B7280',
    accent: '#0f766e',
    accentLight: '#ccfbf1',
    surface: '#f8fafc',
    surfaceAlt: '#f1f5f9',
    border: '#e2e8f0',
    rule: '#cbd5e0',
};

const FMT = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const money = (v: number): string => {
    if (v == null || Number.isNaN(v)) return '$ 0.00';
    return `$ ${FMT.format(v)}`;
};

const styles: StyleDictionary = {
    h1: { fontSize: 16, bold: true, color: C.ink, margin: [0, 4, 0, 2] },
    h2: { fontSize: 12, bold: true, color: C.body, margin: [0, 14, 0, 6] },
    range: { fontSize: 10, color: C.muted, margin: [0, 0, 0, 8] },
    th: { bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt, alignment: 'center' },
    thLeft: { bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt, alignment: 'left' },
    tdName: { fontSize: 9, color: C.ink, alignment: 'left' },
    tdValue: { fontSize: 9, color: C.ink, alignment: 'right' },
    tdCenter: { fontSize: 9, color: C.ink, alignment: 'center' },
    tdMuted: { fontSize: 9, color: C.muted, alignment: 'left' },
    sectionLabel: {
        bold: true, fontSize: 11, color: C.accent, fillColor: C.accentLight,
        margin: [0, 6, 0, 6], alignment: 'left',
    },
    sectionTotalLabel: {
        bold: true, fontSize: 10, color: C.ink, fillColor: C.surfaceAlt, alignment: 'left',
    },
    sectionTotal: {
        bold: true, fontSize: 10, color: C.ink, fillColor: C.surfaceAlt, alignment: 'right',
    },
    infoLabel: { fontSize: 8, color: C.muted, alignment: 'left', margin: [0, 2, 0, 0] },
    infoValue: { fontSize: 9, color: C.ink, alignment: 'left' },
    foot: { fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 16, 0, 0] },
};

const infoRow = (label: string, value: string, span?: boolean): [Content, Content] => [
    { text: label, style: 'infoLabel' },
    { text: value || '-', style: 'infoValue', colSpan: span ? 7 : 1 },
];

const buildCabeceraInfo = (data: ComprobanteContabilidadData): Content => {
    const c = data.cabecera;
    return {
        table: {
            widths: ['12%', '21%', '12%', '21%', '12%', '22%'],
            body: [
                [
                    infoRow('NUMERO', c.numero_cnccc || '-'),
                    infoRow('FECHA', fDate(c.fecha_trans_cnccc)),
                    { text: '', style: 'infoValue' },
                    infoRow('TIPO', c.nombre_cntcm || '-'),
                    { text: '', style: 'infoValue' },
                    infoRow('ESTADO', c.nombre_cneco || '-'),
                ],
                [
                    { text: '', style: 'infoLabel' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                ],
                [
                    infoRow('BENEFICIARIO', c.nom_geper || '-'),
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    infoRow('MODULO', c.nom_modu || '-'),
                    { text: '', style: 'infoValue' },
                    infoRow('USUARIO', c.nom_usua || '-'),
                ],
                [
                    { text: '', style: 'infoLabel' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                ],
                [
                    infoRow('OBSERVACION', c.observacion_cnccc || ''),
                    infoRow('AUTOMATICO', c.automatico_cnccc ? 'Si' : 'No'),
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                    { text: '', style: 'infoValue' },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingTop: () => 2,
            paddingBottom: () => 2,
            paddingLeft: () => 4,
            paddingRight: () => 4,
        },
    };
};

const buildDetalleTable = (data: ComprobanteContabilidadData): Content => {
    const body: Content[][] = [];

    body.push([
        { text: 'CODIGO', style: 'thLeft' },
        { text: 'CUENTA', style: 'thLeft' },
        { text: 'DEBE', style: 'th' },
        { text: 'HABER', style: 'th' },
        { text: 'OBSERVACION', style: 'thLeft' },
    ]);

    let totalDebe = 0;
    let totalHaber = 0;

    for (const det of data.detalle) {
        const debe = Number(det.debe) || 0;
        const haber = Number(det.haber) || 0;
        totalDebe += debe;
        totalHaber += haber;

        body.push([
            { text: det.codig_recur_cndpc || '', style: 'tdMuted' },
            { text: det.nombre_cndpc || '', style: 'tdName' },
            { text: debe > 0 ? money(debe) : '', style: 'tdValue' },
            { text: haber > 0 ? money(haber) : '', style: 'tdValue' },
            { text: det.observacion_cndcc || det.referencia_cndcc || '', style: 'tdMuted' },
        ]);
    }

    body.push([
        { text: 'TOTALES', style: 'sectionTotalLabel', colSpan: 2 },
        {},
        { text: money(totalDebe), style: 'sectionTotal' },
        { text: money(totalHaber), style: 'sectionTotal' },
        { text: '', style: 'sectionTotalLabel' },
    ]);

    return {
        table: {
            headerRows: 1,
            widths: ['14%', '32%', '18%', '18%', '18%'],
            body,
        },
        layout: {
            hLineWidth: (i) => (i === 0 || i === 1 || i === body.length - 1 ? 0.7 : 0.3),
            vLineWidth: () => 0,
            hLineColor: () => C.border,
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 6,
            paddingRight: () => 6,
        },
    };
};

const firmas = (): Content => ({
    stack: [
        { text: '', margin: [0, 30] },
        {
            columns: [
                {
                    width: '*',
                    stack: [
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: C.ink }], margin: [0, 0, 40, 6] },
                        { text: 'ELABORADO POR', style: { fontSize: 9, bold: true, color: C.ink, alignment: 'center' } },
                    ],
                },
                {
                    width: '*',
                    stack: [
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: C.ink }], margin: [40, 0, 0, 6] },
                        { text: 'REVISADO POR', style: { fontSize: 9, bold: true, color: C.ink, alignment: 'center' } },
                    ],
                },
                {
                    width: '*',
                    stack: [
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: C.ink }], margin: [40, 0, 0, 6] },
                        { text: 'APROBADO POR', style: { fontSize: 9, bold: true, color: C.ink, alignment: 'center' } },
                    ],
                },
            ],
            columnGap: 20,
        },
    ],
    margin: [0, 10, 0, 0],
});

export const comprobanteContabilidadReport = (
    data: ComprobanteContabilidadData,
    header: Content,
): TDocumentDefinitions => ({
    styles,
    pageSize: 'A4',
    pageMargins: [38, 20, 38, 30],
    defaultStyle: { font: 'Inter' },
    footer: (cp, pc) => footerSection(cp, pc, true),
    content: [
        header,
        {
            text: 'COMPROBANTE DE CONTABILIDAD',
            style: 'h1',
            alignment: 'center',
            margin: [0, 10, 0, 4],
        },
        {
            text: `No. ${data.cabecera.numero_cnccc || '-'}  —  ${fDate(data.cabecera.fecha_trans_cnccc)}`,
            style: 'range',
            alignment: 'center',
        },
        {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 519, y2: 0, lineWidth: 0.5, lineColor: C.border }],
            margin: [0, 6, 0, 10],
        },
        buildCabeceraInfo(data),
        {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 519, y2: 0, lineWidth: 0.5, lineColor: C.border }],
            margin: [0, 12, 0, 10],
        },
        buildDetalleTable(data),
        {
            text: `Generado el ${fDate(data.cabecera.fecha_siste_cnccc)} a las ${data.cabecera.hora_sistem_cnccc || '-'}`,
            style: 'foot',
        },
        firmas(),
    ],
});
