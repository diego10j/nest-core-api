import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate } from 'src/util/helpers/date-util';

import { EstadoResultadosData } from './interfaces/estado-resultados-rep';

const C = {
  ink: '#111827',
  body: '#374151',
  muted: '#6B7280',
  accent: '#92400e',
  accentLight: '#fef3c7',
  positive: '#065f46',
  positiveBg: '#d1fae5',
  negative: '#991b1b',
  negativeBg: '#fee2e2',
  surface: '#f8fafc',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
  rule: '#cbd5e0',
};

const FMT = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = (v: number): string => {
  if (v == null || Number.isNaN(v)) return '$ 0.00';
  return `$ ${FMT.format(Math.abs(v))}`;
};

const styles: StyleDictionary = {
  h1: { fontSize: 16, bold: true, color: C.ink, margin: [0, 4, 0, 2] },
  h2: { fontSize: 12, bold: true, color: C.body, margin: [0, 20, 0, 6] },
  range: { fontSize: 10, color: C.muted, margin: [0, 0, 0, 14] },
  th: {
    bold: true,
    fontSize: 9,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'center',
  },
  thLeft: {
    bold: true,
    fontSize: 9,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'left',
  },
  tdCode: { fontSize: 9, color: C.muted, alignment: 'left' },
  tdName: { fontSize: 9, color: C.ink, alignment: 'left' },
  tdValue: { fontSize: 9, color: C.ink, alignment: 'right' },
  sectionLabel: {
    bold: true,
    fontSize: 11,
    color: C.accent,
    fillColor: C.accentLight,
    margin: [0, 6, 0, 6],
    alignment: 'left',
  },
  sectionTotal: {
    bold: true,
    fontSize: 10,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'right',
  },
  sectionTotalLabel: {
    bold: true,
    fontSize: 10,
    color: C.ink,
    fillColor: C.surfaceAlt,
    alignment: 'left',
  },
  kpiCard: {
    fontSize: 9,
    color: C.body,
    alignment: 'center',
  },
  kpiValue: {
    fontSize: 14,
    bold: true,
    alignment: 'center',
  },
  netLabel: {
    bold: true,
    fontSize: 12,
    color: C.ink,
    fillColor: C.surface,
  },
  netValue: {
    bold: true,
    fontSize: 12,
  },
  foot: { fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 16, 0, 0] },
};

const kpi = (label: string, value: number, positiveColor: boolean): Content => ({
  stack: [
    { text: label.toUpperCase(), style: { ...styles.kpiCard, color: C.muted, fontSize: 7 } },
    {
      text: money(value),
      style: 'kpiValue',
      color: positiveColor ? C.positive : C.ink,
      margin: [0, 4, 0, 0],
    },
  ],
  margin: [4, 8, 4, 8],
});

const getDepth = (codigo: string): number => {
  if (!codigo) return 0;
  return codigo.split('.').length - 1;
};

const row = (
  code: string,
  name: string,
  value: number,
  _level: number,
  isParent: boolean,
): [Content, Content, Content] => {
  const depth = getDepth(code);
  const nameStyle = isParent ? { ...styles.tdName, bold: true } : styles.tdName;
  const valStyle = isParent ? { ...styles.tdValue, bold: true } : styles.tdValue;

  const nameCell: Content = depth > 0
    ? { columns: [{ width: depth * 14, text: '' }, { width: '*', text: name.trimStart(), style: nameStyle }], columnGap: 0 }
    : { text: name.trimStart(), style: nameStyle };

  return [
    { text: code, style: styles.tdCode },
    nameCell,
    { text: money(value), style: valStyle },
  ];
};

const buildAccountTable = (data: EstadoResultadosData): Content => {
  const typeOrder = [
    data.totalesPorTipo.find(
      (t) => t.nombre_cntcu?.toLowerCase().includes('ingresos'),
    ),
    data.totalesPorTipo.find(
      (t) => t.nombre_cntcu?.toLowerCase().includes('costos'),
    ),
    data.totalesPorTipo.find(
      (t) => t.nombre_cntcu?.toLowerCase().includes('gastos'),
    ),
  ].filter(Boolean);

  const sections: Content[] = [];

  for (const tipo of typeOrder) {
    if (!tipo) continue;
    const cuentas = data.cuentas.filter(
      (c) => Number(c.ide_cntcu) === Number(tipo.ide_cntcu),
    );
    if (cuentas.length === 0) continue;

    const bodyRows = cuentas.map((c) =>
      row(c.codig_recur_cndpc, c.nombre_cndpc, c.valor, c.nivel, c.con_ide_cndpc == null),
    );

    const sectionTotal = Number(tipo.total) || 0;

    sections.push({
      text: tipo.nombre_cntcu.toUpperCase(),
      style: 'sectionLabel',
    });

    sections.push({
      table: {
        headerRows: 1,
        widths: ['18%', '52%', '30%'],
        body: [
          [
            { text: 'CODIGO', style: 'thLeft' },
            { text: 'CUENTA', style: 'thLeft' },
            { text: 'SALDO', style: 'th' },
          ],
          ...bodyRows,
          [
            { text: `Total ${tipo.nombre_cntcu}`, style: 'sectionTotalLabel', colSpan: 2 },
            {},
            { text: money(sectionTotal), style: 'sectionTotal' },
          ],
        ],
      },
      layout: {
        hLineWidth: (i) => (i === 0 || i === 1 || i === bodyRows.length + 1 ? 0.7 : 0.3),
        vLineWidth: () => 0,
        hLineColor: () => C.border,
        paddingTop: () => 4,
        paddingBottom: () => 4,
        paddingLeft: () => 6,
        paddingRight: () => 6,
      },
    });

    sections.push({ text: '', margin: [0, 4] });
  }

  sections.push({
    stack: [
      {
        canvas: [
          { type: 'line', x1: 0, y1: 2, x2: 519, y2: 2, lineWidth: 1, lineColor: C.accent },
        ],
        margin: [0, 8, 0, 8],
      },
      {
        columns: [
          kpi('Ingresos', data.totalIngresos, true),
          { text: '−', style: { fontSize: 14, bold: true, color: C.muted, alignment: 'center' }, width: 20, margin: [0, 16, 0, 0] },
          kpi('Costos', data.totalCostos, false),
          { text: '−', style: { fontSize: 14, bold: true, color: C.muted, alignment: 'center' }, width: 20, margin: [0, 16, 0, 0] },
          kpi('Gastos', data.totalGastos, false),
        ],
        columnGap: 4,
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 2, x2: 519, y2: 2, lineWidth: 1, lineColor: C.accent },
        ],
        margin: [0, 4, 0, 8],
      },
      {
        table: {
          widths: ['70%', '30%'],
          body: [
            [
              {
                text: data.utilidadNeta >= 0 ? 'UTILIDAD NETA DEL EJERCICIO' : 'PÉRDIDA NETA DEL EJERCICIO',
                style: 'netLabel',
                color: data.utilidadNeta >= 0 ? C.positive : C.negative,
              },
              {
                text: money(data.utilidadNeta),
                style: 'netValue',
                color: data.utilidadNeta >= 0 ? C.positive : C.negative,
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
      },
    ],
  });

  sections.push({
    text: 'Ingresos − Costos − Gastos = Utilidad (Pérdida) Neta',
    style: 'foot',
  });

  return { stack: sections };
};

export const estadoResultadosReport = (
  data: EstadoResultadosData,
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
      text: 'ESTADO DE RESULTADOS',
      style: 'h1',
      alignment: 'center',
      margin: [0, 10, 0, 2],
    },
    {
      text: `Al ${fDate(data.fechaFin)}`,
      style: 'range',
      alignment: 'center',
    },
    {
      text: `Período: ${fDate(data.fechaInicio)} — ${fDate(data.fechaFin)}`,
      style: 'range',
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
      margin: [0, 4, 0, 14],
    },
    buildAccountTable(data),
    {
      stack: [
        {
          text: '',
          margin: [0, 40],
        },
        {
          columns: [
            {
              width: '*',
              stack: [
                {
                  canvas: [
                    { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: C.ink },
                  ],
                  margin: [0, 0, 40, 6],
                },
                {
                  text: 'CONTADOR',
                  style: { fontSize: 9, bold: true, color: C.ink, alignment: 'center' },
                },
              ],
            },
            {
              width: '*',
              stack: [
                {
                  canvas: [
                    { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: C.ink },
                  ],
                  margin: [40, 0, 0, 6],
                },
                {
                  text: 'GERENTE GENERAL',
                  style: { fontSize: 9, bold: true, color: C.ink, alignment: 'center' },
                },
              ],
            },
          ],
          columnGap: 20,
        },
      ],
      margin: [0, 30, 0, 0],
    },
  ],
});
