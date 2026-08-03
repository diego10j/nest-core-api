import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { HeaderSection } from 'src/reports/common/sections/header.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';

import { OrdenPagoRep } from './interfaces/orden-pago-rep';

const COLOR = {
    ink: '#111827',
    body: '#374151',
    muted: '#6B7280',
    surface: '#F9FAFB',
    border: '#E5E7EB',
    accentLine: '#d8e2ef',
    grisFila: '#f9fafb',
    blanco: '#ffffff',
    azulNavy: '#1e3a5f',
};

const th = (text: string, align: 'left' | 'center' | 'right' = 'center') => ({
    text,
    fontSize: 8,
    bold: true,
    color: COLOR.azulNavy,
    alignment: align,
    fillColor: COLOR.surface,
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    margin: [4, 7, 4, 7] as [number, number, number, number],
});

const td = (text: string | number, fill: string, align: 'left' | 'center' | 'right' = 'left', bold = false) => ({
    text: String(text),
    fontSize: 7.5,
    color: COLOR.ink,
    bold,
    alignment: align,
    fillColor: fill,
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    margin: [4, 5, 4, 5] as [number, number, number, number],
});

const hairlineTableLayout = {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === node.table.body.length ? 0 : i === 0 ? 0.6 : i === 1 ? 1 : 0.4,
    hLineColor: (i: number) => (i <= 1 ? COLOR.accentLine : COLOR.border),
    vLineWidth: () => 0,
    paddingTop: () => 1,
    paddingBottom: () => 1,
    paddingLeft: () => 4,
    paddingRight: () => 4,
};

export const ordenPagoReport = (
    data: OrdenPagoRep,
    empresa: Empresa,
): TDocumentDefinitions => {
    const { cabecera, gruposProveedor, totalGeneral } = data;

    const header = HeaderSection.createReportHeader(empresa, {
        ideEmpr: cabecera.ide_empr,
        title: 'Orden de Pago',
        subTitle: `Nro. ${cabecera.secuencial_cpcop}`,
        showLogo: true,
        showDate: true,
    });

    const panelInfo: Content = {
        table: {
            widths: ['*', '*'],
            body: [[
                {
                    stack: [
                        { text: [{ text: 'Estado: ', bold: true, fontSize: 8, color: COLOR.muted }, { text: cabecera.estado ?? '---', fontSize: 8, color: COLOR.ink }] },
                        { text: [{ text: 'Usuario: ', bold: true, fontSize: 8, color: COLOR.muted }, { text: cabecera.nombre_usuario ?? '---', fontSize: 8, color: COLOR.ink }], margin: [0, 3, 0, 0] },
                    ],
                    border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                    borderColor: [COLOR.border, COLOR.border, COLOR.border, COLOR.border] as [string, string, string, string],
                    fillColor: COLOR.blanco,
                    margin: [6, 5, 6, 5] as [number, number, number, number],
                },
                {
                    stack: [
                        { text: [{ text: 'Fecha Generación: ', bold: true, fontSize: 8, color: COLOR.muted }, { text: cabecera.fecha_genera_cpcop ? fDate(cabecera.fecha_genera_cpcop, 'dd/MM/yyyy') : '---', fontSize: 8, color: COLOR.ink }] },
                        { text: [{ text: 'Fecha Pago: ', bold: true, fontSize: 8, color: COLOR.muted }, { text: cabecera.fecha_pago_cpcop ? fDate(cabecera.fecha_pago_cpcop, 'dd/MM/yyyy') : '---', fontSize: 8, color: COLOR.ink }], margin: [0, 3, 0, 0] },
                        ...(cabecera.referencia_cpcop ? [{ text: [{ text: 'Referencia: ', bold: true, fontSize: 8, color: COLOR.muted }, { text: cabecera.referencia_cpcop, fontSize: 8, color: COLOR.ink }], margin: [0, 3, 0, 0] }] : []),
                    ],
                    border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
                    borderColor: ['', COLOR.border, COLOR.border, COLOR.border] as [string, string, string, string],
                    fillColor: COLOR.blanco,
                    margin: [6, 5, 6, 5] as [number, number, number, number],
                },
            ]],
        },
        layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => COLOR.border,
            vLineColor: () => COLOR.border,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 10] as [number, number, number, number],
    };

    const cuerpoDetalles = gruposProveedor.map((g, i) => {
        const fill = i % 2 === 0 ? COLOR.blanco : COLOR.grisFila;
        const cuentasTexto = g.cuentasBancarias.length > 0
            ? g.cuentasBancarias.map(c => {
                const partes: string[] = [];
                if (c.nombre_teban) partes.push(c.nombre_teban);
                if (c.numero_cpcbp) partes.push(`Nro. ${c.numero_cpcbp}`);
                if (c.nombre_tetcb) partes.push(`(${c.nombre_tetcb})`);
                return {
                    stack: [
                        { text: partes.join(' ') || '---', fontSize: 7.5, color: COLOR.ink },
                        ...(c.observacion_cpcbp ? [{ text: c.observacion_cpcbp, fontSize: 6, color: COLOR.muted, margin: [0, 1, 0, 0] as [number, number, number, number] }] : []),
                    ],
                };
            }).reduce<Content[]>((acc, stack, idx, arr) => {
                acc.push(stack);
                if (idx < arr.length - 1) {
                    acc.push({ text: ' | ', fontSize: 7.5, color: COLOR.muted });
                }
                return acc;
            }, [])
            : [{ text: '---', fontSize: 7.5, color: COLOR.ink }];

        return [
            td(g.numPago, fill, 'center'),
            {
                stack: [
                    { text: g.nombreProveedor, fontSize: 7.5, color: COLOR.ink, margin: [4, 5, 4, 1] as [number, number, number, number] },
                    { text: g.identificacion, fontSize: 6.5, color: COLOR.muted, margin: [4, 0, 4, 5] as [number, number, number, number] },
                ],
                fillColor: fill,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
            td(g.facturas, fill),
            td(fCurrency(g.valorTotal), fill, 'right'),
            {
                stack: cuentasTexto,
                fillColor: fill,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                margin: [4, 5, 4, 5] as [number, number, number, number],
            },
        ];
    });

    const tablaDetalles: Content = {
        table: {
            headerRows: 1,
            widths: ['6%', '22%', '22%', '14%', '36%'],
            body: [
                [
                    th('N°'),
                    th('Proveedor', 'left'),
                    th('Facturas', 'left'),
                    th('Valor', 'right'),
                    th('Cuentas Bancarias', 'left'),
                ],
                ...cuerpoDetalles,
            ],
        },
        layout: hairlineTableLayout,
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    const totalRow: Content = {
        table: {
            widths: ['6%', '22%', '22%', '14%', '36%'],
            body: [[
                { text: '', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: '', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: 'TOTAL', fontSize: 10, bold: true, color: COLOR.azulNavy, alignment: 'right', border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 8, 4, 8] as [number, number, number, number] },
                { text: fCurrency(totalGeneral), fontSize: 10, bold: true, color: COLOR.azulNavy, alignment: 'right', border: [false, false, false, false] as [boolean, boolean, boolean, boolean], margin: [4, 8, 4, 8] as [number, number, number, number] },
                { text: '', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
            ]],
        },
        layout: {
            hLineWidth: (i: number) => (i === 0 ? 1.5 : i === 1 ? 1.5 : 0),
            hLineColor: () => COLOR.accentLine,
            vLineWidth: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 4, 0, 0] as [number, number, number, number],
    };

    return {
        pageSize: 'A4',
        pageMargins: [38, 20, 38, 35] as [number, number, number, number],
        defaultStyle: { font: 'Inter', fontSize: 9, color: COLOR.ink },
        footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount),
        content: [
            header,
            panelInfo,
            tablaDetalles,
            totalRow,
        ],
    };
};
