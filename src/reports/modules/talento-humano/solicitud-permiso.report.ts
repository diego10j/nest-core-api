import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { HeaderSection } from 'src/reports/common/sections/header.section';
import { fDate } from 'src/util/helpers/date-util';

import { SolicitudPermisoRep } from './interfaces/solicitud-permiso-rep';

const COLOR = {
    ink: '#111827',
    muted: '#6B7280',
    surface: '#F9FAFB',
    border: '#E5E7EB',
    azulNavy: '#1e3a5f',
};

const fila = (label: string, valor: string): Content => ({
    columns: [
        { text: label, width: 140, fontSize: 9, bold: true, color: COLOR.muted },
        { text: valor || '—', fontSize: 9, color: COLOR.ink },
    ],
    margin: [0, 4, 0, 4] as [number, number, number, number],
});

export const solicitudPermisoReport = (
    data: SolicitudPermisoRep,
    empresa: Empresa,
): TDocumentDefinitions => {
    const header = HeaderSection.createReportHeader(empresa, {
        ideEmpr: data.ide_empr,
        title: data.tipoLabel,
        subTitle: `Solicitud N° ${data.ide_aspvh}`,
        showLogo: true,
        showDate: true,
    });

    const panel: Content = {
        table: {
            widths: ['*'],
            body: [[
                {
                    stack: [
                        fila('Empleado:', data.empleado),
                        fila('Identificación:', data.identificacion),
                        fila('Cargo:', data.cargo ?? '—'),
                        fila('Fecha de solicitud:', fDate(data.fecha_solicitud_aspvh, 'dd/MM/yyyy')),
                        fila(
                            'Período:',
                            data.fecha_desde_aspvh === data.fecha_hasta_aspvh
                                ? fDate(data.fecha_desde_aspvh, 'dd/MM/yyyy')
                                : `${fDate(data.fecha_desde_aspvh, 'dd/MM/yyyy')} — ${fDate(data.fecha_hasta_aspvh, 'dd/MM/yyyy')}`,
                        ),
                        ...(data.hora_desde_aspvh
                            ? [fila('Horario:', `${data.hora_desde_aspvh}${data.hora_hasta_aspvh ? ` — ${data.hora_hasta_aspvh}` : ''}`)]
                            : []),
                        ...(data.nro_dias_aspvh != null ? [fila('Días:', String(data.nro_dias_aspvh))] : []),
                        ...(data.nro_horas_aspvh != null ? [fila('Horas:', String(data.nro_horas_aspvh))] : []),
                        fila('Motivo:', data.detalle_aspvh ?? '—'),
                    ],
                    border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                    borderColor: [COLOR.border, COLOR.border, COLOR.border, COLOR.border] as [string, string, string, string],
                    fillColor: COLOR.surface,
                    margin: [12, 10, 12, 10] as [number, number, number, number],
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
        margin: [0, 12, 0, 30] as [number, number, number, number],
    };

    const firmas: Content = {
        columns: [
            {
                stack: [
                    { text: '', margin: [0, 30, 0, 0] as [number, number, number, number] },
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: COLOR.border }] },
                    { text: `Firma del empleado — ${data.empleado}`, fontSize: 8, color: COLOR.muted, margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                width: '50%',
            },
            {
                stack: [
                    { text: '', margin: [0, 30, 0, 0] as [number, number, number, number] },
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: COLOR.border }] },
                    { text: 'Autoriza — Coordinador / RRHH', fontSize: 8, color: COLOR.muted, margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                width: '50%',
            },
        ],
    };

    return {
        pageSize: 'A4',
        pageMargins: [40, 20, 40, 35] as [number, number, number, number],
        defaultStyle: { font: 'Inter', fontSize: 9, color: COLOR.ink },
        footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount),
        content: [
            header,
            panel,
            firmas,
        ],
    };
};
