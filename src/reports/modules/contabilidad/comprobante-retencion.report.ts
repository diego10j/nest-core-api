import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import {
    RIDE_COLOR,
    buildEncabezadoRide,
    buildInfoAdicionalSection,
    buildPanelContraparte,
    campoTexto,
    fmtNumero,
    rideStyles,
    splitNumeroDocumento,
    td,
    th,
} from 'src/reports/common/ride/ride-report.util';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';

import { ComprobanteRetencionRep } from './interfaces/comprobante-retencion-rep';

/** RIDE del Comprobante de Retención (Anexo 14 Ficha Técnica SRI), layout de referencia: rep_comp_elec/comprobanteRetencion.jrxml. */
export const comprobanteRetencionReport = (
    data: ComprobanteRetencionRep,
    empresa: Empresa,
    barcodeDataUrl?: string,
): TDocumentDefinitions => {
    const { cabecera, detalles, total } = data;
    const { estab, ptoEmi, secuencial } = splitNumeroDocumento(cabecera.numero_cncre);
    const numero = fmtNumero(estab, ptoEmi, secuencial);

    const encabezado = buildEncabezadoRide({
        titulo: 'COMPROBANTE DE RETENCIÓN',
        numero,
        empresa,
        claveAcceso: cabecera.claveacceso_srcom,
        numeroAutorizacion: cabecera.autorizacion_srcomn,
        fechaAutorizacion: cabecera.fechaautoriza_srcom,
        barcodeDataUrl,
    });

    const panelContraparte = buildPanelContraparte(
        [
            campoTexto('Razón Social / Nombres y Apellidos', cabecera.nom_geper ?? ''),
            campoTexto('Identificación', cabecera.identificac_geper ?? ''),
            campoTexto('Dirección', cabecera.direccion_geper ?? ''),
            campoTexto('Fecha Emisión', cabecera.fecha_emisi_cncre ? fDate(cabecera.fecha_emisi_cncre, 'dd/MM/yyyy') : '---'),
        ],
        [
            campoTexto('Ejercicio Fiscal', cabecera.periodo_fiscal_srcom ?? ''),
            campoTexto('Comprobante', cabecera.nombre_cntdo ?? ''),
            campoTexto('Número', cabecera.numero_cpcfa ?? ''),
            campoTexto('Fecha Emisión Comprobante', cabecera.fecha_emisi_cpcfa ? fDate(cabecera.fecha_emisi_cpcfa, 'dd/MM/yyyy') : '---'),
        ],
    );

    const cuerpoDetalles = detalles.map((d, i) => {
        const fill = i % 2 === 0 ? RIDE_COLOR.blanco : RIDE_COLOR.grisFila;
        return [
            td(fCurrency(Number(d.base_cndre ?? 0)), fill, 'right'),
            td(d.nombre_cncim ?? '', fill),
            td(d.casillero_cncim ?? '', fill, 'center'),
            td(`${Number(d.porcentaje_cndre ?? 0)}%`, fill, 'center'),
            td(fCurrency(Number(d.valor_cndre ?? 0)), fill, 'right'),
        ];
    });

    const tablaDetalles: Content = {
        table: {
            headerRows: 1,
            widths: ['16%', '*', '14%', '15%', '16%'],
            body: [
                [
                    th('Base Imponible', 'right'),
                    th('Impuesto'),
                    th('Casillero', 'center'),
                    th('% Retención', 'center'),
                    th('Valor Retenido', 'right'),
                ],
                ...cuerpoDetalles,
            ],
        },
        layout: {
            hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
            vLineWidth: () => 0,
            hLineColor: () => RIDE_COLOR.grisLinea,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    const totalSection: Content = {
        columns: [
            { text: '', width: '*' },
            {
                width: 180,
                table: {
                    widths: ['*', 80],
                    body: [
                        [
                            { text: 'TOTAL RETENIDO', style: 'totalGrandLabel', fillColor: RIDE_COLOR.grisTh, border: [true, true, true, true] as [boolean, boolean, boolean, boolean], borderColor: [RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string] },
                            { text: fCurrency(total), style: 'totalGrandValor', fillColor: RIDE_COLOR.grisTh, border: [false, true, true, true] as [boolean, boolean, boolean, boolean], borderColor: ['', RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string] },
                        ],
                    ],
                },
                layout: {
                    hLineWidth: () => 0.4,
                    vLineWidth: () => 0.4,
                    hLineColor: () => RIDE_COLOR.grisLinea,
                    vLineColor: () => RIDE_COLOR.grisLinea,
                    paddingTop: () => 2,
                    paddingBottom: () => 2,
                    paddingLeft: () => 2,
                    paddingRight: () => 2,
                },
            },
        ],
        margin: [0, 4, 0, 6] as [number, number, number, number],
    };

    const infoAdicional = buildInfoAdicionalSection([
        { nombre: 'Observación', valor: cabecera.observacion_cncre },
    ]);

    return {
        pageSize: 'A4',
        pageMargins: [30, 20, 30, 35] as [number, number, number, number],
        styles: rideStyles,
        defaultStyle: { font: 'Inter', fontSize: 9, color: RIDE_COLOR.negro },
        footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount, false),
        content: [
            encabezado,
            panelContraparte,
            tablaDetalles,
            totalSection,
            infoAdicional,
        ],
    };
};
