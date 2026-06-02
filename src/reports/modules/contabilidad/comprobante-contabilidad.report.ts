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
    positive: '#065f46',
    negative: '#991b1b',
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
    h1: { fontSize: 14, bold: true, color: C.ink, margin: [0, 4, 0, 2] },
    h2: { fontSize: 12, bold: true, color: C.body },
    range: { fontSize: 9, color: C.muted, margin: [0, 0, 0, 6] },
    th: { bold: true, fontSize: 8, color: C.ink, fillColor: C.surfaceAlt, alignment: 'center' },
    thLeft: { bold: true, fontSize: 8, color: C.ink, fillColor: C.surfaceAlt, alignment: 'left' },
    tdName: { fontSize: 8, color: C.ink, alignment: 'left' },
    tdValue: { fontSize: 8, color: C.ink, alignment: 'right' },
    tdMuted: { fontSize: 8, color: C.muted, alignment: 'left' },
    sectionTotalLabel: {
        bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt, alignment: 'left',
    },
    sectionTotal: {
        bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt, alignment: 'right',
    },
    lbl: { fontSize: 7, color: C.muted, bold: true, margin: [0, 0, 0, 1] },
    val: { fontSize: 8, color: C.ink },
    foot: { fontSize: 7, color: C.muted, alignment: 'center', margin: [0, 12, 0, 0] },
};

const labelValue = (label: string, value: string): Content => ({
    stack: [
        { text: label, style: 'lbl' },
        { text: value || '-', style: 'val' },
    ],
});

const labelValueSpan = (label: string, value: string, colSpan: number): Content => ({
    stack: [
        { text: label, style: 'lbl' },
        { text: value || '-', style: 'val' },
    ],
    colSpan,
});

const buildCabeceraInfo = (data: ComprobanteContabilidadData): Content => {
    const c = data.cabecera;
    return {
        table: {
            widths: ['12%', '24%', '12%', '16%', '14%', '22%'],
            body: [
                // ── Fila 1: ID | Numero | Fecha | Tipo | Estado | Modulo ──
                [
                    labelValue('ID', String(c.ide_cnccc)),
                    labelValue('NUMERO', c.numero_cnccc || '-'),
                    labelValue('FECHA', fDate(c.fecha_trans_cnccc)),
                    labelValue('TIPO', c.nombre_cntcm || '-'),
                    labelValue('ESTADO', c.nombre_cneco || '-'),
                    labelValue('MODULO', c.nom_modu || '-'),
                ],
                // ── Fila 2: Beneficiario (full width) ──
                [
                    labelValueSpan('BENEFICIARIO', c.nom_geper || '-', 6),
                    {}, {}, {}, {}, {},
                ],
                // ── Fila 3: Usuario | Automatico ──
                [
                    labelValue('USUARIO', c.nom_usua || '-'),
                    labelValue('AUTOMATICO', c.automatico_cnccc ? 'Si' : 'No'),
                    { text: '', style: 'val' },
                    { text: '', style: 'val' },
                    { text: '', style: 'val' },
                    { text: '', style: 'val' },
                ],
                // ── Fila 4: Observacion (full width) ──
                [
                    labelValueSpan('OBSERVACION', c.observacion_cnccc || '-', 6),
                    {}, {}, {}, {}, {},
                ],
            ],
        },
        layout: {
            hLineWidth: (i) => (i === 0 || i === 3 ? 0.5 : 0),
            vLineWidth: () => 0,
            hLineColor: () => C.rule,
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 6,
            paddingRight: () => 6,
        },
    };
};

const buildDetalleTable = (data: ComprobanteContabilidadData): Content => {
    const body: Content[][] = [];

    body.push([
        { text: 'CODIGO', style: 'thLeft' },
        { text: 'CUENTA CONTABLE', style: 'thLeft' },
        { text: 'DEBE', style: 'th' },
        { text: 'HABER', style: 'th' },
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
            {
                stack: [
                    { text: det.nombre_cndpc || '', style: 'tdName' },
                    ...(det.observacion_cndcc || det.referencia_cndcc
                        ? [{ text: det.observacion_cndcc || det.referencia_cndcc || '', style: { ...styles.tdMuted, fontSize: 7 } }]
                        : []),
                ],
            },
            { text: debe > 0 ? money(debe) : '', style: 'tdValue' },
            { text: haber > 0 ? money(haber) : '', style: 'tdValue' },
        ]);
    }

    body.push([
        { text: 'TOTALES', style: 'sectionTotalLabel' },
        { text: '', style: 'sectionTotalLabel' },
        { text: money(totalDebe), style: 'sectionTotal' },
        { text: money(totalHaber), style: 'sectionTotal' },
    ]);

    const balanceado = Math.abs(totalDebe - totalHaber) < 0.01;

    return {
        stack: [
            {
                table: {
                    headerRows: 1,
                    widths: ['15%', '43%', '21%', '21%'],
                    body,
                },
                layout: {
                    hLineWidth: (i) => (i === 0 || i === 1 || i === body.length - 1 ? 0.7 : i % 2 === 0 ? 0.2 : 0),
                    vLineWidth: () => 0,
                    hLineColor: () => C.border,
                    paddingTop: () => 3,
                    paddingBottom: () => 3,
                    paddingLeft: () => 5,
                    paddingRight: () => 5,
                },
            },
            {
                columns: [
                    { text: '', width: '*' },
                    {
                        width: 'auto',
                        stack: [
                            {
                                text: balanceado ? 'COMPROBANTE BALANCEADO' : 'COMPROBANTE DESBALANCEADO',
                                style: {
                                    fontSize: 7,
                                    bold: true,
                                    color: balanceado ? C.positive : C.negative,
                                    alignment: 'right',
                                },
                                margin: [0, 6, 0, 0],
                            },
                        ],
                    },
                ],
            },
        ],
    };
};

const firmas = (usuario: string | null): Content => ({
    stack: [
        { text: '', margin: [0, 20] },
        {
            columns: [
                {
                    width: '*',
                    stack: [
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 155, y2: 0, lineWidth: 0.7, lineColor: C.ink }], margin: [0, 0, 20, 6] },
                        { text: 'ELABORADO POR', style: { fontSize: 8, bold: true, color: C.ink, alignment: 'center' } },
                        { text: usuario || '', style: { fontSize: 7, color: C.muted, alignment: 'center', margin: [0, 4, 0, 0] } },
                    ],
                },
                {
                    width: '*',
                    stack: [
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 155, y2: 0, lineWidth: 0.7, lineColor: C.ink }], margin: [20, 0, 20, 6] },
                        { text: 'REVISADO POR', style: { fontSize: 8, bold: true, color: C.ink, alignment: 'center' } },
                    ],
                },
                {
                    width: '*',
                    stack: [
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 155, y2: 0, lineWidth: 0.7, lineColor: C.ink }], margin: [20, 0, 0, 6] },
                        { text: 'APROBADO POR', style: { fontSize: 8, bold: true, color: C.ink, alignment: 'center' } },
                    ],
                },
            ],
            columnGap: 0,
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
    pageMargins: [40, 20, 40, 30],
    defaultStyle: { font: 'Inter' },
    footer: (cp, pc) => footerSection(cp, pc, true),
    content: [
        header,
        {
            text: 'COMPROBANTE DE CONTABILIDAD',
            style: 'h1',
            alignment: 'center',
            margin: [0, 12, 0, 6],
        },
        {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: C.accent }],
            margin: [0, 4, 0, 8],
        },
        buildCabeceraInfo(data),
        {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: C.accent }],
            margin: [0, 2, 0, 10],
        },
        buildDetalleTable(data),
        {
            text: `Documento generado el ${fDate(data.cabecera.fecha_siste_cnccc)} a las ${data.cabecera.hora_sistem_cnccc || '-'}  •  ID: ${data.cabecera.ide_cnccc}`,
            style: 'foot',
        },
        firmas(data.cabecera.nom_usua),
    ],
});
