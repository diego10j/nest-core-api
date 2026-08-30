import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { HeaderSection } from 'src/reports/common/sections/header.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';

import { RolPagosRep } from './interfaces/rol-pagos-rep';

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
    fontSize: 6.5,
    bold: true,
    color: COLOR.azulNavy,
    alignment: align,
    fillColor: COLOR.surface,
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    margin: [2, 6, 2, 6] as [number, number, number, number],
});

const td = (text: string | number, fill: string, align: 'left' | 'center' | 'right' = 'left', bold = false) => ({
    text: String(text),
    fontSize: 6.5,
    color: COLOR.ink,
    bold,
    alignment: align,
    fillColor: fill,
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    margin: [2, 4, 2, 4] as [number, number, number, number],
});

const hairlineTableLayout = {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === node.table.body.length ? 0 : i === 0 ? 0.6 : i === 1 ? 1 : 0.4,
    hLineColor: (i: number) => (i <= 1 ? COLOR.accentLine : COLOR.border),
    vLineWidth: () => 0,
    paddingTop: () => 1,
    paddingBottom: () => 1,
    paddingLeft: () => 2,
    paddingRight: () => 2,
};

const COLS = ['4%', '16%', '10%', '12%', '8%', '8%', '7%', '7%', '8%', '8%', '7%', '5%'];

export const rolPagosReport = (
    data: RolPagosRep,
    empresa: Empresa,
): TDocumentDefinitions => {
    const { cabecera, empleados } = data;

    const header = HeaderSection.createReportHeader(empresa, {
        ideEmpr: cabecera.ide_empr,
        title: 'Rol de Pagos',
        subTitle: `${cabecera.tipo_nomina} · ${fDate(cabecera.fecha_nrrol, 'MMMM yyyy')}`,
        showLogo: true,
        showDate: true,
    });

    const cuerpo = empleados.map((e, i) => {
        const fill = i % 2 === 0 ? COLOR.blanco : COLOR.grisFila;
        return [
            td(i + 1, fill, 'center'),
            {
                stack: [
                    { text: e.empleado, fontSize: 6.5, color: COLOR.ink, margin: [2, 4, 2, 0] as [number, number, number, number] },
                    { text: e.cargo ?? '---', fontSize: 5.5, color: COLOR.muted, margin: [2, 0, 2, 4] as [number, number, number, number] },
                ],
                fillColor: fill,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
            td(e.identificacion, fill, 'center'),
            td(fCurrency(e.sueldo), fill, 'right'),
            td(fCurrency(e.horasExtra), fill, 'right'),
            td(fCurrency(e.decimoTercero), fill, 'right'),
            td(fCurrency(e.decimoCuarto), fill, 'right'),
            td(fCurrency(e.fondosReserva), fill, 'right'),
            td(fCurrency(e.totalIngresos), fill, 'right', true),
            td(fCurrency(e.iess), fill, 'right'),
            td(fCurrency(e.prestamos), fill, 'right'),
            td(fCurrency(e.liquido), fill, 'right', true),
        ];
    });

    const totales = empleados.reduce(
        (acc, e) => ({
            sueldo: acc.sueldo + e.sueldo,
            horasExtra: acc.horasExtra + e.horasExtra,
            decimoTercero: acc.decimoTercero + e.decimoTercero,
            decimoCuarto: acc.decimoCuarto + e.decimoCuarto,
            fondosReserva: acc.fondosReserva + e.fondosReserva,
            totalIngresos: acc.totalIngresos + e.totalIngresos,
            iess: acc.iess + e.iess,
            prestamos: acc.prestamos + e.prestamos,
            liquido: acc.liquido + e.liquido,
        }),
        { sueldo: 0, horasExtra: 0, decimoTercero: 0, decimoCuarto: 0, fondosReserva: 0, totalIngresos: 0, iess: 0, prestamos: 0, liquido: 0 },
    );

    const totalRow = [
        { text: '', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
        { text: 'TOTAL GENERAL', fontSize: 7, bold: true, color: COLOR.azulNavy, alignment: 'right' as const, border: [false, true, false, false] as [boolean, boolean, boolean, boolean], borderColor: [COLOR.accentLine, COLOR.accentLine, COLOR.accentLine, COLOR.accentLine] as [string, string, string, string], margin: [2, 6, 2, 2] as [number, number, number, number] },
        { text: '', border: [false, true, false, false] as [boolean, boolean, boolean, boolean], borderColor: [COLOR.accentLine, COLOR.accentLine, COLOR.accentLine, COLOR.accentLine] as [string, string, string, string] },
        ...([totales.sueldo, totales.horasExtra, totales.decimoTercero, totales.decimoCuarto, totales.fondosReserva, totales.totalIngresos, totales.iess, totales.prestamos, totales.liquido] as number[]).map((v) => ({
            text: fCurrency(v),
            fontSize: 7,
            bold: true,
            color: COLOR.azulNavy,
            alignment: 'right' as const,
            border: [false, true, false, false] as [boolean, boolean, boolean, boolean],
            borderColor: [COLOR.accentLine, COLOR.accentLine, COLOR.accentLine, COLOR.accentLine] as [string, string, string, string],
            margin: [2, 6, 2, 2] as [number, number, number, number],
        })),
    ];

    const tabla: Content = {
        table: {
            headerRows: 1,
            widths: COLS,
            body: [
                [
                    th('N°'),
                    th('Nombres / Cargo', 'left'),
                    th('Cédula'),
                    th('Sueldo', 'right'),
                    th('H. Extra', 'right'),
                    th('Décimo 3°', 'right'),
                    th('Décimo 4°', 'right'),
                    th('F. Reserva', 'right'),
                    th('Total Ingr.', 'right'),
                    th('IESS 9.45%', 'right'),
                    th('Préstamos', 'right'),
                    th('Líquido', 'right'),
                ],
                ...cuerpo,
                totalRow,
            ],
        },
        layout: hairlineTableLayout,
        margin: [0, 10, 0, 24] as [number, number, number, number],
    };

    const firmas: Content = {
        columns: [
            {
                stack: [
                    { text: '', margin: [0, 20, 0, 0] as [number, number, number, number] },
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.6, lineColor: COLOR.border }] },
                    { text: 'Elaborado por', fontSize: 7, color: COLOR.muted, margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                width: '50%',
            },
            {
                stack: [
                    { text: '', margin: [0, 20, 0, 0] as [number, number, number, number] },
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.6, lineColor: COLOR.border }] },
                    { text: 'Aprobado por', fontSize: 7, color: COLOR.muted, margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                width: '50%',
            },
        ],
    };

    return {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [24, 20, 24, 35] as [number, number, number, number],
        defaultStyle: { font: 'Inter', fontSize: 8, color: COLOR.ink },
        footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount),
        content: [
            header,
            tabla,
            firmas,
        ],
    };
};
