import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate } from 'src/util/helpers/date-util';

import { FlujoEfectivoData } from './interfaces/flujo-efectivo-rep';

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
  return `$ ${FMT.format(Math.abs(v))}`;
};

const styles: StyleDictionary = {
  h1: { fontSize: 16, bold: true, color: C.ink, margin: [0, 4, 0, 2] },
  h2: { fontSize: 12, bold: true, color: C.body, margin: [0, 14, 0, 6] },
  range: { fontSize: 10, color: C.muted, margin: [0, 0, 0, 14] },
  th: { bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt, alignment: 'center' },
  thLeft: { bold: true, fontSize: 9, color: C.ink, fillColor: C.surfaceAlt, alignment: 'left' },
  tdName: { fontSize: 9, color: C.ink, alignment: 'left' },
  tdValue: { fontSize: 9, color: C.ink, alignment: 'right' },
  sectionLabel: {
    bold: true, fontSize: 11, color: C.accent, fillColor: C.accentLight,
    margin: [0, 6, 0, 6] as [number, number, number, number], alignment: 'left',
  },
  subtotalLabel: { bold: true, fontSize: 10, color: C.ink, fillColor: C.surfaceAlt, alignment: 'left' },
  subtotalValue: { bold: true, fontSize: 10, color: C.ink, fillColor: C.surfaceAlt, alignment: 'right' },
  netLabel: { bold: true, fontSize: 11, color: C.ink, fillColor: C.surface },
  netValue: { bold: true, fontSize: 11 },
  foot: { fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 16, 0, 0] },
  sep: { fontSize: 2 },
};

const sep2 = (): [Content, Content] => [
  { text: ' ', style: 'sep', colSpan: 2, border: [false, true, false, false], margin: [0, 3, 0, 5] },
  {},
];

const sep3 = (): [Content, Content, Content] => [
  { text: ' ', style: 'sep', colSpan: 3, border: [false, true, false, false], margin: [0, 3, 0, 5] },
  {},
  {},
];

const accountRow = (desc: string, value: number): [Content, Content] => [
  { text: desc, style: 'tdName', margin: [20, 0, 0, 0] },
  { text: money(value), style: 'tdValue' },
];

const subtotalRow = (label: string, value: number): [Content, Content] => [
  { text: label, style: 'subtotalLabel' },
  { text: money(value), style: 'subtotalValue' },
];

const buildFlujoTable = (data: FlujoEfectivoData): Content => {
  const sections: Content[] = [];

  // ── 1. Flujos de efectivo por actividades de operación ─────────────────
  sections.push({ text: 'FLUJOS DE EFECTIVO POR ACTIVIDADES DE OPERACIÓN', style: 'sectionLabel' });

  const operacionBody: Content[][] = [];

  operacionBody.push([
    { text: '', style: 'thLeft' },
    { text: '', style: 'th' },
  ]);

  operacionBody.push([
    { text: 'Utilidad (pérdida) del ejercicio', style: 'tdName', margin: [10, 0, 0, 0] },
    { text: money(data.utilidadEjercicio), style: 'tdValue', color: data.utilidadEjercicio >= 0 ? C.positive : C.negative },
  ]);

  if (data.ajustesNoMonetarios.length > 0) {
    operacionBody.push([
      { text: 'Ajustes por partidas no monetarias:', style: { ...styles.tdName, bold: true, fontSize: 9, color: C.muted, margin: [10, 4, 0, 2] } },
      { text: '' },
    ]);
    for (const r of data.ajustesNoMonetarios) {
      operacionBody.push(accountRow(r.descripcion, r.variacion_periodo));
    }
    operacionBody.push(subtotalRow('Total ajustes no monetarios', data.totalAjustes));
  }

  if (data.capitalTrabajo.length > 0) {
    operacionBody.push([
      { text: 'Cambios en el capital de trabajo:', style: { ...styles.tdName, bold: true, fontSize: 9, color: C.muted, margin: [10, 4, 0, 2] } },
      { text: '' },
    ]);
    for (const r of data.capitalTrabajo) {
      operacionBody.push(accountRow(r.descripcion, r.variacion_periodo));
    }
    operacionBody.push(subtotalRow('Total cambios en capital de trabajo', data.totalCapitalTrabajo));
  }

  operacionBody.push(sep2());
  operacionBody.push(subtotalRow('Flujo neto de efectivo — Actividades de Operación', data.flujoOperacional));

  sections.push({
    table: {
      headerRows: 0,
      widths: ['70%', '30%'],
      body: [...operacionBody],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  sections.push({ text: '', margin: [0, 10] });

  // ── 2. Flujos de efectivo por actividades de inversión ─────────────────
  sections.push({ text: 'FLUJOS DE EFECTIVO POR ACTIVIDADES DE INVERSIÓN', style: 'sectionLabel' });

  const inversionBody: Content[][] = [];
  if (data.flujosInversion.length > 0) {
    for (const r of data.flujosInversion) {
      inversionBody.push(accountRow(r.descripcion, r.variacion_periodo));
    }
  } else {
    inversionBody.push([
      { text: 'Sin movimientos en el período', style: { ...styles.tdName, color: C.muted, margin: [10, 0, 0, 0] } },
      { text: '' },
    ]);
  }
  inversionBody.push(sep2());
  inversionBody.push(subtotalRow('Flujo neto de efectivo — Actividades de Inversión', data.flujoInversion));

  sections.push({
    table: {
      headerRows: 0,
      widths: ['70%', '30%'],
      body: [...inversionBody],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  sections.push({ text: '', margin: [0, 10] });

  // ── 3. Flujos de efectivo por actividades de financiamiento ────────────
  sections.push({ text: 'FLUJOS DE EFECTIVO POR ACTIVIDADES DE FINANCIAMIENTO', style: 'sectionLabel' });

  const financiamientoBody: Content[][] = [];
  if (data.flujosFinanciamiento.length > 0) {
    for (const r of data.flujosFinanciamiento) {
      financiamientoBody.push(accountRow(r.descripcion, r.variacion_periodo));
    }
  } else {
    financiamientoBody.push([
      { text: 'Sin movimientos en el período', style: { ...styles.tdName, color: C.muted, margin: [10, 0, 0, 0] } },
      { text: '' },
    ]);
  }
  financiamientoBody.push(sep2());
  financiamientoBody.push(subtotalRow('Flujo neto de efectivo — Actividades de Financiamiento', data.flujoFinanciamiento));

  sections.push({
    table: {
      headerRows: 0,
      widths: ['70%', '30%'],
      body: [...financiamientoBody],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  // ── 4. Variación neta de efectivo ──────────────────────────────────────
  sections.push({ text: '', margin: [0, 8] });
  sections.push({
    table: {
      widths: ['70%', '30%'],
      body: [
        [
          {
            text: 'VARIACIÓN NETA DE EFECTIVO Y EQUIVALENTES',
            style: 'netLabel',
            color: data.variacionNetaEfectivo >= 0 ? C.positive : C.negative,
          },
          {
            text: money(data.variacionNetaEfectivo),
            style: 'netValue',
            color: data.variacionNetaEfectivo >= 0 ? C.positive : C.negative,
            alignment: 'right',
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: () => 0,
      hLineColor: () => C.border,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  // ── 5. Conciliación del efectivo ───────────────────────────────────────
  sections.push({ text: '', margin: [0, 14] });
  sections.push({ text: 'CONCILIACIÓN DEL EFECTIVO Y EQUIVALENTES', style: 'sectionLabel' });

  const conciliacionBody: Content[][] = [];

  if (data.cuentasEfectivo.length > 0) {
    conciliacionBody.push([
      { text: 'Cuenta', style: 'thLeft' },
      { text: 'Saldo Inicial', style: 'th' },
      { text: 'Saldo Final', style: 'th' },
    ]);
    for (const c of data.cuentasEfectivo) {
      conciliacionBody.push([
        { text: c.nombre_tecba, style: styles.tdName },
        { text: money(c.saldo_inicio), style: styles.tdValue },
        { text: money(c.saldo_fin), style: styles.tdValue },
      ]);
    }
    conciliacionBody.push([
      { text: 'Total', style: 'subtotalLabel' },
      { text: money(data.efectivoInicio), style: 'subtotalValue' },
      { text: money(data.efectivoFin), style: 'subtotalValue' },
    ]);
  } else {
    conciliacionBody.push([
      { text: 'Efectivo al inicio del período', style: styles.tdName },
      { text: money(data.efectivoInicio), style: styles.tdValue },
    ]);
    conciliacionBody.push([
      { text: 'Efectivo al final del período', style: styles.tdName },
      { text: money(data.efectivoFin), style: styles.tdValue },
    ]);
  }

  conciliacionBody.push(data.cuentasEfectivo.length > 0 ? sep3() : sep2());
  const variacionReal = Math.round((data.efectivoFin - data.efectivoInicio) * 100) / 100;
  conciliacionBody.push(
    data.cuentasEfectivo.length > 0
      ? [
          { text: 'Variación real del efectivo', style: 'subtotalLabel', colSpan: 2 },
          {},
          { text: money(variacionReal), style: 'subtotalValue' },
        ]
      : subtotalRow('Variación real del efectivo', variacionReal),
  );

  sections.push({
    table: {
      headerRows: data.cuentasEfectivo.length > 0 ? 1 : 0,
      widths: data.cuentasEfectivo.length > 0 ? ['50%', '25%', '25%'] : ['70%', '30%'],
      body: [...conciliacionBody],
    },
    layout: {
      hLineWidth: (i) => (i === 0 || i === conciliacionBody.length - 2 ? 0.7 : 0.3),
      vLineWidth: () => 0,
      hLineColor: () => C.border,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  sections.push({
    text: 'NOTA: El flujo de efectivo se presenta bajo el Método Indirecto (NIC 7)',
    style: 'foot',
  });

  return { stack: sections };
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
            { text: 'CONTADOR', style: { fontSize: 9, bold: true, color: C.ink, alignment: 'center' } },
            { text: 'Registro Profesional: ___________', style: { fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 2] } },
          ],
        },
        {
          width: '*',
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: C.ink }], margin: [40, 0, 0, 6] },
            { text: 'GERENTE GENERAL', style: { fontSize: 9, bold: true, color: C.ink, alignment: 'center' } },
            { text: 'Representante Legal', style: { fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 2] } },
          ],
        },
      ],
      columnGap: 20,
    },
  ],
  margin: [0, 10, 0, 0],
});

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
    { text: 'ESTADO DE FLUJO DE EFECTIVO', style: 'h1', alignment: 'center', margin: [0, 10, 0, 2] },
    { text: `Al ${fDate(data.fechaFin)}`, style: 'range', alignment: 'center' },
    { text: `Período: ${fDate(data.fechaInicio)} — ${fDate(data.fechaFin)}`, style: 'range' },
    {
      text: 'Método Indirecto — NIC 7',
      style: { fontSize: 9, color: C.muted, alignment: 'center', margin: [0, 0, 0, 8] },
    },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 519, y2: 0, lineWidth: 0.5, lineColor: C.border }],
      margin: [0, 4, 0, 14],
    },
    buildFlujoTable(data),
    firmas(),
  ],
});
