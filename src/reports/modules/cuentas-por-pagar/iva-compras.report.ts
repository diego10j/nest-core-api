import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { CompraMensualRow } from 'src/core/modules/cuentas-por-pagar/dto/reporte-compras-mensuales.dto';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';

// ─── Paleta neutral y profesional (misma que IVA en Ventas) ──────
const C = {
  ink: '#1a1d27',
  body: '#374151',
  muted: '#6b7280',
  rule: '#e5e7eb',
  bg: '#f9fafb',
  white: '#ffffff',
  accent: '#1e3a5f',
  accentSurface: '#f5f8fc',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface IvaComprasRep {
  mes: number;
  periodo: number;
  facturas: CompraMensualRow[];
  notasCredito: CompraMensualRow[];
}

const sumar = (rows: CompraMensualRow[]) =>
  rows.reduce(
    (acc, r) => ({
      ventas12: acc.ventas12 + Number(r.ventas12 || 0),
      ventas0: acc.ventas0 + Number(r.ventas0 || 0),
      valor_iva: acc.valor_iva + Number(r.valor_iva || 0),
      total: acc.total + Number(r.total || 0),
    }),
    { ventas12: 0, ventas0: 0, valor_iva: 0, total: 0 },
  );

const sectionTitle = (texto: string): Content => ({
  text: texto,
  fontSize: 10,
  bold: true,
  color: C.ink,
  margin: [0, 14, 0, 6],
});

const th = (texto: string, alignment: 'left' | 'right' | 'center' = 'left'): Content => ({
  text: texto,
  fontSize: 8,
  bold: true,
  color: C.accent,
  fillColor: C.accentSurface,
  alignment,
  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
  margin: [4, 6, 4, 6] as [number, number, number, number],
});

const td = (
  texto: string,
  alignment: 'left' | 'right' | 'center' = 'left',
  fillColor?: string,
): Content => ({
  text: texto,
  fontSize: 8,
  color: C.body,
  fillColor,
  alignment,
  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
  margin: [4, 4, 4, 4] as [number, number, number, number],
});

const buildTabla = (rows: CompraMensualRow[], etiquetaVacio: string): Content => {
  if (rows.length === 0) {
    return {
      text: etiquetaVacio,
      italics: true,
      color: C.muted,
      fontSize: 8.5,
      margin: [0, 2, 0, 8],
    };
  }

  const totales = sumar(rows);

  const body: Content[][] = [
    [
      th('Fecha'),
      th('N° Documento'),
      th('Proveedor'),
      th('RUC / CI'),
      th('Base Gravada', 'right'),
      th('Base 0%', 'right'),
      th('IVA', 'right'),
      th('Total', 'right'),
    ],
    ...rows.map((r, i): Content[] => {
      const fill = i % 2 === 0 ? C.white : C.bg;
      return [
        td(fDate(r.fecha), 'left', fill),
        td(r.numero, 'left', fill),
        td(r.nom_geper, 'left', fill),
        td(r.identificac_geper, 'left', fill),
        td(fCurrency(Number(r.ventas12 || 0)), 'right', fill),
        td(fCurrency(Number(r.ventas0 || 0)), 'right', fill),
        td(fCurrency(Number(r.valor_iva || 0)), 'right', fill),
        td(fCurrency(Number(r.total || 0)), 'right', fill),
      ];
    }),
    [
      {
        text: `Subtotal (${rows.length})`, colSpan: 4, bold: true, fontSize: 8, color: C.ink,
        fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        margin: [4, 5, 4, 5],
      },
      {}, {}, {},
      { text: fCurrency(totales.ventas12), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
      { text: fCurrency(totales.ventas0), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
      { text: fCurrency(totales.valor_iva), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
      { text: fCurrency(totales.total), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
    ],
  ];

  return {
    table: {
      headerRows: 1,
      // Fecha con ancho fijo (no 'auto'): a 'auto' quedaba angosta y el texto de la
      // fecha se partía en 2 líneas. 'Proveedor' sigue flexible ('*') pero al crecer
      // Fecha le queda automáticamente un poco menos de espacio, como se pidió.
      widths: [65, 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    margin: [0, 0, 0, 4],
  };
};

export const ivaComprasReport = (data: IvaComprasRep, headerSection: Content): TDocumentDefinitions => {
  const totalesFacturas = sumar(data.facturas);
  const totalesNotasCredito = sumar(data.notasCredito);
  const totalGeneral = {
    ventas12: totalesFacturas.ventas12 - totalesNotasCredito.ventas12,
    ventas0: totalesFacturas.ventas0 - totalesNotasCredito.ventas0,
    valor_iva: totalesFacturas.valor_iva - totalesNotasCredito.valor_iva,
    total: totalesFacturas.total - totalesNotasCredito.total,
  };

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    // Margen superior normal (no reservado para header): la cabecera va como
    // contenido normal del flujo (ver `content` abajo), así que en la hoja 2+ no
    // queda un espacio vacío donde antes se repetía el `header` de página.
    pageMargins: [30, 30, 30, 40],
    info: { title: 'IVA en Compras' },
    footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount, false),
    content: [
      // La cabecera (logo + empresa + título) se agrega como contenido normal, no como
      // `header` de página: así solo aparece una vez (al inicio del flujo, hoja 1) y no
      // reserva espacio fijo en las hojas siguientes ni se recorta por falta de alto.
      headerSection,
      {
        text: `Período: ${MESES[data.mes - 1] ?? data.mes} ${data.periodo}`,
        fontSize: 9,
        color: C.muted,
        alignment: 'center',
        margin: [0, 0, 0, 10],
      },
      sectionTitle('FACTURAS'),
      buildTabla(data.facturas, 'No se registraron facturas en el período.'),
      sectionTitle('NOTAS DE CRÉDITO'),
      buildTabla(data.notasCredito, 'No se registraron notas de crédito en el período.'),
      {
        margin: [0, 14, 0, 0],
        table: {
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'TOTAL GENERAL', bold: true, fontSize: 9, color: C.ink, margin: [4, 5, 4, 5] },
              { text: fCurrency(totalGeneral.ventas12), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: fCurrency(totalGeneral.ventas0), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: fCurrency(totalGeneral.valor_iva), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: fCurrency(totalGeneral.total), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => C.accentSurface,
        },
      },
      {
        text: '(Facturas menos Notas de Crédito del período)',
        italics: true,
        fontSize: 7.5,
        color: C.muted,
        alignment: 'right',
        margin: [0, 2, 0, 0],
      },
    ],
    defaultStyle: { font: 'Inter', fontSize: 8, color: C.body },
  };
};
