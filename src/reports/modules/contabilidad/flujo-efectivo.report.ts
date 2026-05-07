import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate } from 'src/util/helpers/date-util';

import { FlujoEfectivoData, LineaFlujo } from './interfaces/flujo-efectivo-rep';

const C = {
    ink: '#111827',
    body: '#374151',
    muted: '#6B7280',
    accent: '#065f46',
    accentLight: '#d1fae5',
    inversion: '#1e3a8a',
    inversionLight: '#dbeafe',
    financiamiento: '#7c3aed',
    financiamientoLight: '#ede9fe',
    positive: '#065f46',
    positiveBg: '#d1fae5',
    negative: '#991b1b',
    negativeBg: '#fee2e2',
    surface: '#f8fafc',
    surfaceAlt: '#f1f5f9',
    border: '#e2e8f0',
    warning: '#92400e',
    warningBg: '#fef3c7',
};

const FMT = new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const money = (v: number): string => {
    if (v == null || Number.isNaN(v)) return '$ 0.00';
    const abs = `$ ${FMT.format(Math.abs(v))}`;
    return v < 0 ? `(${abs})` : abs;
};

const styles: StyleDictionary = {
    h1: { fontSize: 15, bold: true, color: C.ink, margin: [0, 4, 0, 2] },
    range: { fontSize: 9, color: C.muted, margin: [0, 0, 0, 10] },
    sectionHeader: { bold: true, fontSize: 10, color: '#ffffff', margin: [4, 4, 4, 4] },
    lineDesc: { fontSize: 9, color: C.body },
    lineValue: { fontSize: 9, color: C.ink, alignment: 'right' },
    subtotalLabel: { bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt },
    subtotalValue: { bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt, alignment: 'right' },
    totalLabel: { bold: true, fontSize: 10, color: C.ink, fillColor: C.surface },
    totalValue: { bold: true, fontSize: 10, color: C.ink, fillColor: C.surface, alignment: 'right' },
    efectivoDesc: { fontSize: 9, color: C.muted },
    efectivoValue: { fontSize: 9, color: C.ink, alignment: 'right' },
    foot: { fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 12, 0, 0] },
};

const tableLayout = {
    hLineWidth: (i: number, node: any) =>
        i === 0 || i === node.table.body.length ? 0.7 : 0.3,
    vLineWidth: () => 0,
    hLineColor: () => C.border,
    paddingTop: () => 3,
    paddingBottom: () => 3,
    paddingLeft: () => 6,
    paddingRight: () => 6,
};

const sectionBlock = (
    label: string,
    fillColor: string,
    lineas: LineaFlujo[],
    subtotalLabel: string,
    subtotal: number,
): Content => {
    if (lineas.length === 0 && subtotal === 0) return { text: '' };

    const bodyRows: any[][] = lineas.map((l) => [
        { text: `    ${l.descripcion}`, style: styles.lineDesc },
        { text: money(l.variacion_periodo), style: styles.lineValue },
    ]);

    bodyRows.push([
        { text: subtotalLabel, style: styles.subtotalLabel },
        { text: money(subtotal), style: styles.subtotalValue },
    ]);

    return {
        stack: [
            {
                table: {
                    widths: ['*'],
                    body: [[{ text: label, style: styles.sectionHeader, fillColor }]],
                },
                layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
                margin: [0, 8, 0, 0],
            },
            {
                table: {
                    widths: ['*', '25%'],
                    body: bodyRows,
                },
                layout: tableLayout,
            },
        ],
    };
};

const buildBody = (data: FlujoEfectivoData): Content => {
    const sections: Content[] = [];

    // ── ACTIVIDADES DE OPERACIÓN ──────────────────────────────────────────────────
    const opRows: any[][] = [
        [
            { text: `    Utilidad (Pérdida) del ejercicio`, style: styles.lineDesc },
            { text: money(data.utilidadEjercicio), style: styles.lineValue },
        ],
    ];

    if (data.ajustesNoMonetarios.length > 0) {
        opRows.push([
            { text: `    Ajustes por partidas no monetarias:`, style: { ...styles.lineDesc, bold: true } },
            { text: '', style: styles.lineValue },
        ]);
        data.ajustesNoMonetarios.forEach((l) => {
            opRows.push([
                { text: `        ${l.descripcion}`, style: styles.lineDesc },
                { text: money(l.variacion_periodo), style: styles.lineValue },
            ]);
        });
    }

    if (data.capitalTrabajo.length > 0) {
        opRows.push([
            { text: `    Cambios en capital de trabajo:`, style: { ...styles.lineDesc, bold: true } },
            { text: '', style: styles.lineValue },
        ]);
        data.capitalTrabajo.forEach((l) => {
            opRows.push([
                { text: `        ${l.descripcion}`, style: styles.lineDesc },
                { text: money(l.variacion_periodo), style: styles.lineValue },
            ]);
        });
    }

    opRows.push([
        { text: 'FLUJO NETO DE ACTIVIDADES OPERACIONALES', style: styles.subtotalLabel },
        {
            text: money(data.flujoOperacional),
            style: { ...styles.subtotalValue, color: data.flujoOperacional >= 0 ? C.positive : C.negative },
        },
    ]);

    sections.push({
        stack: [
            {
                table: {
                    widths: ['*'],
                    body: [[{ text: 'ACTIVIDADES DE OPERACIÓN', style: styles.sectionHeader, fillColor: C.accent }]],
                },
                layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
                margin: [0, 8, 0, 0],
            },
            {
                table: { widths: ['*', '25%'], body: opRows },
                layout: tableLayout,
            },
        ],
    });

    // ── ACTIVIDADES DE INVERSIÓN ─────────────────────────────────────────────────
    sections.push(
        sectionBlock(
            'ACTIVIDADES DE INVERSIÓN',
            C.inversion,
            data.flujosInversion,
            'FLUJO NETO DE ACTIVIDADES DE INVERSIÓN',
            data.flujoInversion,
        ),
    );

    // ── ACTIVIDADES DE FINANCIAMIENTO ────────────────────────────────────────────
    sections.push(
        sectionBlock(
            'ACTIVIDADES DE FINANCIAMIENTO',
            C.financiamiento,
            data.flujosFinanciamiento,
            'FLUJO NETO DE ACTIVIDADES DE FINANCIAMIENTO',
            data.flujoFinanciamiento,
        ),
    );

    // ── CONCILIACIÓN FINAL ────────────────────────────────────────────────────────
    const variacion = data.variacionNetaEfectivo;
    const cuadre = Math.abs(data.efectivoFin - (data.efectivoInicio + variacion)) < 0.02;

    sections.push({
        table: {
            widths: ['*'],
            body: [[{
                text: 'CONCILIACIÓN DE EFECTIVO Y EQUIVALENTES',
                style: styles.sectionHeader,
                fillColor: cuadre ? '#374151' : C.warning,
            }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 10, 0, 0],
    });

    const concilRows: any[][] = [
        [
            { text: 'Efectivo y equivalentes al INICIO del período', style: styles.efectivoDesc },
            { text: money(data.efectivoInicio), style: styles.efectivoValue },
        ],
        [
            { text: '    + Flujo neto operacional', style: styles.efectivoDesc },
            { text: money(data.flujoOperacional), style: styles.efectivoValue },
        ],
        [
            { text: '    + Flujo neto de inversión', style: styles.efectivoDesc },
            { text: money(data.flujoInversion), style: styles.efectivoValue },
        ],
        [
            { text: '    + Flujo neto de financiamiento', style: styles.efectivoDesc },
            { text: money(data.flujoFinanciamiento), style: styles.efectivoValue },
        ],
        [
            { text: 'VARIACIÓN NETA DE EFECTIVO', style: styles.subtotalLabel },
            {
                text: money(variacion),
                style: { ...styles.subtotalValue, color: variacion >= 0 ? C.positive : C.negative },
            },
        ],
        [
            { text: 'Efectivo y equivalentes al FIN del período', style: styles.totalLabel },
            {
                text: money(data.efectivoFin),
                style: { ...styles.totalValue, color: data.efectivoFin >= 0 ? C.positive : C.negative },
            },
        ],
    ];

    // Desglose por cuenta de efectivo
    if (data.cuentasEfectivo.length > 1) {
        concilRows.push([
            { text: 'Desglose al cierre:', colSpan: 2, style: { ...styles.efectivoDesc, bold: true, margin: [0, 4, 0, 0] } },
            {},
        ]);
        data.cuentasEfectivo.forEach((c) => {
            concilRows.push([
                { text: `    ${c.nombre_tecba}`, style: styles.efectivoDesc },
                { text: money(c.saldo_fin), style: styles.efectivoValue },
            ]);
        });
    }

    if (!cuadre) {
        concilRows.push([
            {
                text: `⚠ Diferencia detectada: ${money(data.efectivoFin - data.efectivoInicio - variacion)}. Verifique que todas las cuentas de efectivo estén registradas en Tesorería.`,
                colSpan: 2,
                style: { fontSize: 8, color: C.warning, margin: [0, 4, 0, 0] },
            },
            {},
        ]);
    }

    sections.push({
        table: { widths: ['*', '25%'], body: concilRows },
        layout: tableLayout,
    });

    return { stack: sections };
};

export const flujoEfectivoReport = (
    data: FlujoEfectivoData,
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
            text: 'ESTADO DE FLUJO DE EFECTIVO',
            style: 'h1',
            alignment: 'center',
            margin: [0, 10, 0, 2],
        },
        {
            text: 'Método Indirecto — NIC 7',
            style: { fontSize: 9, color: C.muted, alignment: 'center' },
        },
        {
            text: `Período: ${fDate(data.fechaInicio)} — ${fDate(data.fechaFin)}`,
            style: 'range',
            alignment: 'center',
            margin: [0, 4, 0, 14],
        },
        buildBody(data),
        {
            text: 'NIC 7 — Estado de Flujo de Efectivo (Método Indirecto)',
            style: 'foot',
        },
    ],
});
