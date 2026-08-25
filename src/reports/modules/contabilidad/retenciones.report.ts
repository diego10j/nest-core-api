import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { RetencionRow } from 'src/core/modules/contabilidad/dto/reporte-retenciones.dto';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';

// ─── Paleta neutral y profesional (misma que IVA en Ventas/Compras) ──────
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

export interface RetencionesRep {
  fechaInicio: string;
  fechaFin: string;
  rows: RetencionRow[];
}

const sumar = (rows: RetencionRow[]) =>
  rows.reduce(
    (acc, r) => ({
      base_renta: acc.base_renta + Number(r.base_renta || 0),
      ret_renta: acc.ret_renta + Number(r.ret_renta || 0),
      base_iva: acc.base_iva + Number(r.base_iva || 0),
      ret_iva: acc.ret_iva + Number(r.ret_iva || 0),
      total_retenido: acc.total_retenido + Number(r.total_retenido || 0),
    }),
    { base_renta: 0, ret_renta: 0, base_iva: 0, ret_iva: 0, total_retenido: 0 },
  );

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

/**
 * Tabla de retenciones — comparte layout con `personaLabel` (Proveedor/Cliente) parametrizable
 * porque compras y ventas usan el mismo desglose Renta/IVA pero difieren en a quién identifica
 * cada fila.
 */
const buildTabla = (rows: RetencionRow[], personaLabel: string): Content => {
  if (rows.length === 0) {
    return {
      text: 'No se registraron retenciones en el período.',
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
      th('N° Retención / Autorización'),
      th(personaLabel),
      th('N° Documento'),
      th('Base Renta', 'right'),
      th('Ret. Renta', 'right'),
      th('Base IVA', 'right'),
      th('Ret. IVA', 'right'),
      th('Total', 'right'),
    ],
    ...rows.map((r, i): Content[] => {
      const fill = i % 2 === 0 ? C.white : C.bg;
      return [
        td(fDate(r.fecha), 'left', fill),
        {
          stack: [
            {
              text: r.es_pago_tarjeta ? [r.numero, { text: '  💳', fontSize: 8 }] : r.numero,
              fontSize: 8,
              color: C.body,
            },
            { text: r.autorizacion, fontSize: 6.5, color: C.muted },
          ],
          fillColor: fill,
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          margin: [4, 4, 4, 4] as [number, number, number, number],
        },
        td(r.nom_geper ?? '', 'left', fill),
        td(r.numero_documento ?? '', 'left', fill),
        td(fCurrency(Number(r.base_renta || 0)), 'right', fill),
        td(fCurrency(Number(r.ret_renta || 0)), 'right', fill),
        td(fCurrency(Number(r.base_iva || 0)), 'right', fill),
        td(fCurrency(Number(r.ret_iva || 0)), 'right', fill),
        td(fCurrency(Number(r.total_retenido || 0)), 'right', fill),
      ];
    }),
    [
      {
        text: `Total (${rows.length})`, colSpan: 4, bold: true, fontSize: 8, color: C.ink,
        fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        margin: [4, 5, 4, 5],
      },
      {}, {}, {},
      { text: fCurrency(totales.base_renta), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
      { text: fCurrency(totales.ret_renta), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
      { text: fCurrency(totales.base_iva), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
      { text: fCurrency(totales.ret_iva), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
      { text: fCurrency(totales.total_retenido), bold: true, fontSize: 8, color: C.ink, alignment: 'right', fillColor: C.accentSurface, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 5, 4, 5] },
    ],
  ];

  return {
    table: {
      headerRows: 1,
      widths: [60, 100, '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    margin: [0, 0, 0, 4],
  };
};

const buildDocDefinition = (
  data: RetencionesRep,
  headerSection: Content,
  titulo: string,
  personaLabel: string,
): TDocumentDefinitions => {
  const totales = sumar(data.rows);

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 40],
    info: { title: titulo },
    footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount, false),
    content: [
      headerSection,
      {
        text: `Período: ${fDate(data.fechaInicio)} al ${fDate(data.fechaFin)}`,
        fontSize: 9,
        color: C.muted,
        alignment: 'center',
        margin: [0, 0, 0, 10],
      },
      buildTabla(data.rows, personaLabel),
      {
        margin: [0, 14, 0, 0],
        table: {
          widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'TOTAL GENERAL', bold: true, fontSize: 9, color: C.ink, margin: [4, 5, 4, 5] },
              { text: fCurrency(totales.base_renta), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: fCurrency(totales.ret_renta), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: fCurrency(totales.base_iva), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: fCurrency(totales.ret_iva), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
              { text: fCurrency(totales.total_retenido), bold: true, fontSize: 9, color: C.ink, alignment: 'right', margin: [4, 5, 4, 5] },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => C.accentSurface,
        },
      },
    ],
    defaultStyle: { font: 'Inter', fontSize: 8, color: C.body },
  };
};

export const retencionesComprasReport = (data: RetencionesRep, headerSection: Content): TDocumentDefinitions =>
  buildDocDefinition(data, headerSection, 'Retenciones en Compras', 'Proveedor');

export const retencionesVentasReport = (data: RetencionesRep, headerSection: Content): TDocumentDefinitions =>
  buildDocDefinition(data, headerSection, 'Retenciones en Ventas', 'Cliente');
