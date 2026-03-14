import type { Content, ContentTable, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate, fDateTime } from 'src/util/helpers/date-util';

import { ProformaRep, ProformaRepDetalle } from './interfaces/proforma-rep';

const COLORS = {
    navy: '#16324f',
    ocean: '#1f6f8b',
    mint: '#dff3f4',
    sand: '#f6f8fb',
    ink: '#1f2937',
    slate: '#64748b',
    line: '#d6dee8',
    successBg: '#e7f7ef',
    successText: '#16794d',
    warningBg: '#fff4dd',
    warningText: '#9a6700',
    dangerBg: '#fde8e8',
    dangerText: '#b42318',
    neutralBg: '#edf2f7',
    neutralText: '#475467',
    white: '#ffffff',
};

const styles: StyleDictionary = {
    heroEyebrow: {
        fontSize: 9,
        bold: true,
        color: '#cfe6ff',
        characterSpacing: 1.2,
    },
    heroTitle: {
        fontSize: 24,
        bold: true,
        color: COLORS.white,
    },
    heroSubTitle: {
        fontSize: 10,
        color: '#dbe7f3',
    },
    amountLabel: {
        fontSize: 9,
        color: '#dbe7f3',
        alignment: 'right',
    },
    amountValue: {
        fontSize: 22,
        bold: true,
        color: COLORS.white,
        alignment: 'right',
    },
    chip: {
        fontSize: 9,
        bold: true,
        color: COLORS.white,
        alignment: 'center',
    },
    sectionTitle: {
        fontSize: 11,
        bold: true,
        color: COLORS.navy,
        margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    label: {
        fontSize: 8,
        bold: true,
        color: COLORS.slate,
        margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    value: {
        fontSize: 10,
        color: COLORS.ink,
        margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    valueStrong: {
        fontSize: 10,
        bold: true,
        color: COLORS.ink,
        margin: [0, 0, 0, 8] as [number, number, number, number],
    },
    tableHeader: {
        fontSize: 9,
        bold: true,
        color: COLORS.navy,
        fillColor: '#edf4fb',
        alignment: 'center',
    },
    tableCell: {
        fontSize: 9,
        color: COLORS.ink,
    },
    noteText: {
        fontSize: 9,
        color: COLORS.ink,
        lineHeight: 1.2,
    },
    summaryLabel: {
        fontSize: 9,
        color: COLORS.slate,
    },
    summaryValue: {
        fontSize: 10,
        bold: true,
        color: COLORS.ink,
        alignment: 'right',
    },
    grandTotalLabel: {
        fontSize: 10,
        bold: true,
        color: COLORS.navy,
    },
    grandTotalValue: {
        fontSize: 13,
        bold: true,
        color: COLORS.ocean,
        alignment: 'right',
    },
    metaText: {
        fontSize: 8,
        color: COLORS.slate,
    },
};

const safeText = (value: unknown, fallback: string = 'No registrado'): string => {
    if (value === null || value === undefined) {
        return fallback;
    }

    const text = String(value).trim();
    return text === '' ? fallback : text;
};

const money = (value: unknown): string => fCurrency(Number(value || 0));

const percent = (value: unknown): string => `${Number(value || 0).toFixed(0)}%`;

const createBadge = (text: string, variant: 'success' | 'warning' | 'danger' | 'neutral'): Content => {
    const palette = {
        success: { bg: COLORS.successBg, text: COLORS.successText },
        warning: { bg: COLORS.warningBg, text: COLORS.warningText },
        danger: { bg: COLORS.dangerBg, text: COLORS.dangerText },
        neutral: { bg: COLORS.neutralBg, text: COLORS.neutralText },
    }[variant];

    return {
        table: {
            widths: ['auto'],
            body: [[{
                text,
                style: 'chip',
                color: palette.text,
                fillColor: palette.bg,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                margin: [10, 5, 10, 5] as [number, number, number, number],
            }]],
        },
        layout: 'noBorders',
    };
};

const card = (content: Content, fillColor: string = COLORS.white): Content => ({
    table: {
        widths: ['*'],
        body: [[{
            stack: Array.isArray(content) ? content : [content],
            fillColor,
            border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
            borderColor: [COLORS.line, COLORS.line, COLORS.line, COLORS.line] as [string, string, string, string],
            margin: [14, 12, 14, 12] as [number, number, number, number],
        }]],
    },
    layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => COLORS.line,
        vLineColor: () => COLORS.line,
        paddingBottom: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
    },
});

const infoField = (label: string, value: unknown, strong = false): Content => ({
    stack: [
        { text: label, style: 'label' },
        { text: safeText(value), style: strong ? 'valueStrong' : 'value' },
    ],
});

const buildDetailDescription = (detalle: ProformaRepDetalle): string => {
    const lines = [safeText(detalle.nombre_inarti, ''), safeText(detalle.observacion_ccdpr, '')].filter(Boolean);
    return lines.join('\n');
};

const detailTable = (detalles: ProformaRepDetalle[]): ContentTable => ({
    table: {
        headerRows: 1,
        widths: [58, '*', 42, 45, 60, 65, 38],
        body: [
            [
                { text: 'Código', style: 'tableHeader' },
                { text: 'Descripción', style: 'tableHeader' },
                { text: 'Und.', style: 'tableHeader' },
                { text: 'Cant.', style: 'tableHeader' },
                { text: 'Precio', style: 'tableHeader' },
                { text: 'Subtotal', style: 'tableHeader' },
                { text: 'IVA', style: 'tableHeader' },
            ],
            ...detalles.map((detalle, index) => {
                const fillColor = index % 2 === 0 ? COLORS.white : COLORS.sand;
                return [
                    { text: safeText(detalle.codigo_inarti, '---'), style: 'tableCell', fillColor, alignment: 'center' },
                    { text: buildDetailDescription(detalle), style: 'tableCell', fillColor },
                    { text: safeText(detalle.siglas_inuni, '---'), style: 'tableCell', fillColor, alignment: 'center' },
                    { text: Number(detalle.cantidad_ccdpr || 0).toFixed(2), style: 'tableCell', fillColor, alignment: 'right' },
                    { text: money(detalle.precio_ccdpr), style: 'tableCell', fillColor, alignment: 'right' },
                    { text: money(detalle.total_ccdpr), style: 'tableCell', fillColor, alignment: 'right' },
                    {
                        text: detalle.iva_inarti_ccdpr > 0 ? percent(detalle.iva_inarti_ccdpr) : '0%',
                        style: 'tableCell',
                        fillColor,
                        alignment: 'center',
                    },
                ];
            }),
        ],
    },
    layout: {
        hLineWidth: (i: number) => (i === 0 || i === 1 ? 0.9 : 0.5),
        vLineWidth: () => 0.5,
        hLineColor: () => COLORS.line,
        vLineColor: () => COLORS.line,
        paddingBottom: () => 6,
        paddingTop: () => 6,
        paddingLeft: () => 6,
        paddingRight: () => 6,
    },
});

export const proformaReport = (proforma: ProformaRep, header: Content): TDocumentDefinitions => {
    const { cabecera, detalles, factura } = proforma;
    const totalItems = detalles.length;
    const totalCantidad = detalles.reduce((acc, item) => acc + Number(item.cantidad_ccdpr || 0), 0);
    const subtotal = Number(cabecera.base_grabada_cccpr || 0) + Number(cabecera.base_tarifa0_cccpr || 0);

    const estadoPrincipal = cabecera.anulado_cccpr
        ? createBadge('ANULADA', 'danger')
        : cabecera.enviado_cccpr
            ? createBadge('ENVIADA', 'success')
            : createBadge('BORRADOR', 'warning');

    const heroSection: Content = {
        table: {
            widths: ['68%', '32%'],
            body: [[
                {
                    stack: [
                        { text: 'PROPUESTA COMERCIAL', style: 'heroEyebrow' },
                        { text: `Proforma #${safeText(cabecera.secuencial_cccpr, 'S/N')}`, style: 'heroTitle', margin: [0, 6, 0, 6] as [number, number, number, number] },
                        {
                            text: `${safeText(cabecera.nombre_cctpr, 'Proforma')} • Emisión ${fDate(cabecera.fecha_cccpr)}`,
                            style: 'heroSubTitle',
                        },
                        {
                            columns: [
                                { width: 'auto', stack: [estadoPrincipal] },
                                factura
                                    ? { width: 'auto', stack: [createBadge(`FACTURADA ${safeText(factura.secuencial_cccfa, '')}`, 'neutral')], margin: [8, 0, 0, 0] as [number, number, number, number] }
                                    : { text: '' },
                            ],
                            margin: [0, 14, 0, 0] as [number, number, number, number],
                        },
                    ],
                    fillColor: COLORS.navy,
                    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                    margin: [18, 18, 18, 18] as [number, number, number, number],
                },
                {
                    stack: [
                        { text: 'Valor total', style: 'amountLabel', margin: [0, 6, 0, 8] as [number, number, number, number] },
                        { text: money(cabecera.total_cccpr), style: 'amountValue' },
                        {
                            canvas: [{ type: 'line', x1: 0, y1: 10, x2: 120, y2: 10, lineWidth: 1, lineColor: '#d8edf1' }],
                            margin: [0, 10, 0, 10] as [number, number, number, number],
                        },
                        { text: `Items: ${totalItems}`, style: 'heroSubTitle', alignment: 'right' },
                        { text: `Cantidad total: ${totalCantidad.toFixed(2)}`, style: 'heroSubTitle', alignment: 'right', margin: [0, 4, 0, 0] as [number, number, number, number] },
                        { text: `IVA aplicado: ${percent(cabecera.tarifa_iva_cccpr)}`, style: 'heroSubTitle', alignment: 'right', margin: [0, 4, 0, 0] as [number, number, number, number] },
                    ],
                    fillColor: COLORS.ocean,
                    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                    margin: [18, 18, 18, 18] as [number, number, number, number],
                },
            ]],
        },
        layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
        },
        margin: [0, 0, 0, 14] as [number, number, number, number],
    };

    const clienteSection = card([
        { text: 'Cliente y contacto', style: 'sectionTitle' },
        {
            columns: [
                { width: '34%', stack: [infoField('Solicitante', cabecera.solicitante_cccpr, true), infoField('Documento', `${safeText(cabecera.nombre_getid, '')} ${safeText(cabecera.identificac_cccpr, 'No registrado')}`.trim())] },
                { width: '33%', stack: [infoField('Contacto', cabecera.contacto_cccpr), infoField('Teléfono', cabecera.telefono_cccpr)] },
                { width: '33%', stack: [infoField('Correo', cabecera.correo_cccpr), infoField('Dirección', cabecera.direccion_cccpr)] },
            ],
            columnGap: 14,
        },
    ], COLORS.white);

    const condicionesSection = card([
        { text: 'Condiciones comerciales', style: 'sectionTitle' },
        {
            columns: [
                { width: '34%', stack: [infoField('Vendedor', cabecera.nombre_vgven, true), infoField('Validez', cabecera.nombre_ccvap)] },
                { width: '33%', stack: [infoField('Tiempo de entrega', cabecera.nombre_ccten), infoField('Referencia', cabecera.referencia_cccpr)] },
                { width: '33%', stack: [infoField('Usuario registro', cabecera.nom_usua), infoField('Utilidad estimada', money(cabecera.utilidad_cccpr), true)] },
            ],
            columnGap: 14,
        },
    ], COLORS.white);

    const facturaSection = factura
        ? card([
            { text: 'Documento relacionado', style: 'sectionTitle' },
            {
                columns: [
                    { width: '40%', stack: [infoField('Factura', safeText(factura.secuencial_cccfa), true), infoField('Fecha emisión', fDate(factura.fecha_emision_cccfa))] },
                    { width: '35%', stack: [infoField('Cliente facturado', factura.cliente), infoField('Identificación', factura.identificacion_cliente)] },
                    { width: '25%', stack: [infoField('Total factura', money(factura.total_cccfa), true)] },
                ],
                columnGap: 14,
            },
        ], '#f9fcff')
        : card([
            { text: 'Documento relacionado', style: 'sectionTitle' },
            { text: 'Esta proforma todavía no tiene una factura emitida asociada.', style: 'noteText' },
        ], '#f9fcff');

    const detalleSection = card([
        { text: 'Detalle valorizado', style: 'sectionTitle' },
        detailTable(detalles),
    ], COLORS.white);

    const observaciones = card([
        { text: 'Observaciones y alcance', style: 'sectionTitle' },
        { text: safeText(cabecera.observacion_cccpr, 'Sin observaciones registradas.'), style: 'noteText' },
    ], COLORS.mint);

    const resumenTotales = card([
        { text: 'Resumen económico', style: 'sectionTitle' },
        {
            table: {
                widths: ['*', 110],
                body: [
                    [{ text: 'Subtotal', style: 'summaryLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }, { text: money(subtotal), style: 'summaryValue', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }],
                    [{ text: 'Base tarifa 0%', style: 'summaryLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }, { text: money(cabecera.base_tarifa0_cccpr), style: 'summaryValue', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }],
                    [{ text: `Base gravada ${percent(cabecera.tarifa_iva_cccpr)}`, style: 'summaryLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }, { text: money(cabecera.base_grabada_cccpr), style: 'summaryValue', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }],
                    [{ text: `IVA ${percent(cabecera.tarifa_iva_cccpr)}`, style: 'summaryLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }, { text: money(cabecera.valor_iva_cccpr), style: 'summaryValue', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }],
                    [{ text: 'Total proforma', style: 'grandTotalLabel', border: [false, true, false, false] as [boolean, boolean, boolean, boolean], borderColor: [COLORS.white, COLORS.line, COLORS.white, COLORS.white] as [string, string, string, string], margin: [0, 8, 0, 0] as [number, number, number, number] }, { text: money(cabecera.total_cccpr), style: 'grandTotalValue', border: [false, true, false, false] as [boolean, boolean, boolean, boolean], borderColor: [COLORS.white, COLORS.line, COLORS.white, COLORS.white] as [string, string, string, string], margin: [0, 8, 0, 0] as [number, number, number, number] }],
                ],
            },
            layout: 'noBorders',
        },
    ], COLORS.white);

    const auditoria = card([
        { text: 'Trazabilidad', style: 'sectionTitle' },
        {
            columns: [
                { width: '33%', stack: [{ text: `Creado por: ${safeText(cabecera.usuario_ingre || cabecera.nom_usua)}`, style: 'metaText' }, { text: `Fecha creación: ${cabecera.fecha_ingre ? fDateTime(cabecera.fecha_ingre) : 'No registrada'}`, style: 'metaText', margin: [0, 4, 0, 0] as [number, number, number, number] }] },
                { width: '33%', stack: [{ text: `Actualizado por: ${safeText(cabecera.usuario_actua)}`, style: 'metaText' }, { text: `Fecha actualización: ${cabecera.fecha_actua ? fDateTime(cabecera.fecha_actua) : 'No registrada'}`, style: 'metaText', margin: [0, 4, 0, 0] as [number, number, number, number] }] },
                { width: '34%', stack: [{ text: `Emitida: ${fDate(cabecera.fecha_cccpr)}`, style: 'metaText' }, { text: `Generado: ${fDateTime(new Date())}`, style: 'metaText', margin: [0, 4, 0, 0] as [number, number, number, number] }] },
            ],
            columnGap: 14,
        },
    ], COLORS.white);

    return {
        styles,
        pageSize: 'A4',
        pageMargins: [34, 22, 34, 28] as [number, number, number, number],
        watermark: cabecera.anulado_cccpr
            ? {
                text: 'ANULADA',
                color: '#d92d20',
                opacity: 0.08,
                bold: true,
            }
            : undefined,
        footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount, true),
        content: [
            header,
            heroSection,
            {
                columns: [
                    { width: '62%', stack: [clienteSection, { text: '', margin: [0, 10, 0, 0] as [number, number, number, number] }, observaciones] },
                    { width: '38%', stack: [condicionesSection, { text: '', margin: [0, 10, 0, 0] as [number, number, number, number] }, facturaSection] },
                ],
                columnGap: 12,
                margin: [0, 0, 0, 12] as [number, number, number, number],
            },
            detalleSection,
            {
                columns: [
                    { width: '56%', stack: [auditoria] },
                    { width: '44%', stack: [resumenTotales] },
                ],
                columnGap: 12,
                margin: [0, 12, 0, 0] as [number, number, number, number],
            },
        ],
    };
};