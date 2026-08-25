import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate } from 'src/util/helpers/date-util';

import { LibroMayorData, MovimientoMayor } from './interfaces/libro-mayor-rep';

const C = {
  ink: '#111827',
  body: '#374151',
  muted: '#6B7280',
  accent: '#1e40af',
  accentLight: '#dbeafe',
  surface: '#f8fafc',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
};

const FMT = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmt = (v: number): string => {
  if (v == null || Number.isNaN(v)) return '0.00';
  return FMT.format(Number(v));
};

const styles: StyleDictionary = {
  h1: { fontSize: 16, bold: true, color: C.ink, margin: [0, 4, 0, 2] },
  cuenta: {
    fontSize: 11,
    bold: true,
    color: C.accent,
    fillColor: C.accentLight,
    margin: [0, 6, 0, 6],
    alignment: 'left',
  },
  range: { fontSize: 10, color: C.muted, margin: [0, 0, 0, 14] },
  th: {
    bold: true,
    fontSize: 8.5,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'center',
  },
  thLeft: {
    bold: true,
    fontSize: 8.5,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'left',
  },
  tdDate: { fontSize: 8.5, color: C.body, alignment: 'left' },
  tdCode: { fontSize: 8.5, color: C.muted, alignment: 'left' },
  tdName: { fontSize: 8.5, color: C.ink, alignment: 'left' },
  tdValue: { fontSize: 8.5, color: C.ink, alignment: 'right' },
  saldoInicialLabel: {
    bold: true,
    italics: true,
    fontSize: 9,
    color: C.accent,
    fillColor: C.surface,
    alignment: 'left',
  },
  saldoInicialValue: {
    bold: true,
    italics: true,
    fontSize: 9,
    color: C.accent,
    fillColor: C.surface,
    alignment: 'right',
  },
  totalLabel: {
    bold: true,
    fontSize: 10,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'right',
  },
  total: {
    bold: true,
    fontSize: 10,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'right',
  },
  foot: { fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 16, 0, 0] },
};

const isSaldoInicial = (m: MovimientoMayor): boolean =>
  m.ide_cnccc == null && /SALDO INICIAL/i.test(m.observacion ?? '');

const movimientoRow = (m: MovimientoMayor): Content[] => {
  if (isSaldoInicial(m)) {
    return [
      { text: fDate(m.fecha_trans_cnccc), style: styles.tdDate },
      { text: '', style: styles.tdCode },
      { text: '', style: styles.tdName },
      { text: 'SALDO INICIAL', style: styles.saldoInicialLabel, colSpan: 3 },
      {},
      {},
      { text: fmt(m.saldo), style: styles.saldoInicialValue },
    ];
  }

  const observacion = m.observacion
    ? `${m.numero_cnccc ? `[${m.numero_cnccc}] ` : ''}${m.observacion}`.trim()
    : m.numero_cnccc || '';

  return [
    { text: fDate(m.fecha_trans_cnccc), style: styles.tdDate },
    { text: m.ide_cnccc != null ? String(m.ide_cnccc) : '', style: styles.tdCode },
    { text: m.beneficiario || '', style: styles.tdName },
    { text: observacion, style: styles.tdName },
    {
      text: Number(m.debe) !== 0 ? fmt(Math.abs(m.debe)) : '',
      style: styles.tdValue,
    },
    {
      text: Number(m.haber) !== 0 ? fmt(Math.abs(m.haber)) : '',
      style: styles.tdValue,
    },
    { text: fmt(m.saldo), style: styles.tdValue },
  ];
};

const buildMovimientosTable = (data: LibroMayorData): Content => {
  const bodyRows = data.movimientos.map((m) => movimientoRow(m));

  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['10%', '7%', '17%', '32%', '11%', '11%', '12%'],
      body: [
        [
          { text: 'FECHA', style: 'th' },
          { text: 'COMP.', style: 'th' },
          { text: 'BENEFICIARIO', style: 'thLeft' },
          { text: 'OBSERVACIÓN', style: 'thLeft' },
          { text: 'DEBE', style: 'th' },
          { text: 'HABER', style: 'th' },
          { text: 'SALDO', style: 'th' },
        ],
        ...bodyRows,
        [
          { text: 'TOTALES', colSpan: 4, style: styles.totalLabel },
          {},
          {},
          {},
          { text: fmt(data.totales.debe), style: styles.total },
          { text: fmt(data.totales.haber), style: styles.total },
          { text: fmt(data.totales.saldo), style: styles.total },
        ],
      ],
    },
    layout: {
      hLineWidth: (i, node) =>
        i === 0 || i === 1 || i === node.table.body.length - 1 ? 0.7 : 0.3,
      vLineWidth: () => 0,
      hLineColor: () => C.border,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
  };
};

export const libroMayorReport = (
  data: LibroMayorData,
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
      text: 'LIBRO MAYOR',
      style: 'h1',
      alignment: 'center',
      margin: [0, 10, 0, 2],
    },
    {
      text: `Período: ${fDate(data.fechaInicio)} — ${fDate(data.fechaFin)}`,
      style: 'range',
      alignment: 'center',
    },
    {
      table: {
        widths: ['12%', '88%'],
        body: [
          [
            { text: 'CUENTA:', style: styles.cuenta },
            {
              text: `${data.cuenta.codig_recur_cndpc} — ${data.cuenta.nombre_cndpc}`,
              style: styles.cuenta,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 6],
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0, y1: 0,
          x2: 519, y2: 0,
          lineWidth: 0.5,
          lineColor: C.border,
        },
      ],
      margin: [0, 0, 0, 10],
    },
    buildMovimientosTable(data),
    {
      text: `Saldo inicial al ${fDate(data.fechaInicio)}: ${fmt(data.totales.saldoInicial)}`,
      style: 'foot',
    },
  ],
});
