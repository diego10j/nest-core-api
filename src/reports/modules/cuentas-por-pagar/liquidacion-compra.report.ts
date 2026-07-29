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

import { LiquidacionCompraRep } from './interfaces/liquidacion-compra-rep';

/** RIDE de la Liquidación de Compra de Bienes y Prestación de Servicios (Anexo 3/17 Ficha Técnica SRI), layout de referencia: rep_comp_elec/liquidacionCompra.jrxml. */
export const liquidacionCompraReport = (
    data: LiquidacionCompraRep,
    empresa: Empresa,
    barcodeDataUrl?: string,
): TDocumentDefinitions => {
    const { cabecera, detalles, reembolsos } = data;
    const { estab, ptoEmi, secuencial } = splitNumeroDocumento(cabecera.numero_cpcfa);
    const numero = fmtNumero(estab, ptoEmi, secuencial);

    const encabezado = buildEncabezadoRide({
        titulo: 'LIQUIDACIÓN DE COMPRA DE BIENES Y PRESTACIÓN DE SERVICIOS',
        numero,
        empresa,
        claveAcceso: cabecera.claveacceso_srcom,
        numeroAutorizacion: cabecera.autorizacion_srcomn,
        fechaAutorizacion: cabecera.fechaautoriza_srcom,
        barcodeDataUrl,
    });

    const panelProveedor = buildPanelContraparte(
        [
            campoTexto('Razón Social / Nombres y Apellidos', cabecera.nom_geper ?? ''),
            campoTexto('Dirección', cabecera.direccion_geper ?? ''),
            campoTexto('Fecha Emisión', cabecera.fecha_emisi_cpcfa ? fDate(cabecera.fecha_emisi_cpcfa, 'dd/MM/yyyy') : '---'),
        ],
        [
            campoTexto('Identificación', cabecera.identificac_geper ?? ''),
            campoTexto('Teléfono', cabecera.telefono_geper ?? ''),
            campoTexto('Correo', cabecera.correo_geper ?? ''),
        ],
    );

    const cuerpoDetalles = detalles.map((d, i) => {
        const fill = i % 2 === 0 ? RIDE_COLOR.blanco : RIDE_COLOR.grisFila;
        const cantidadTexto = d.siglas_inuni
            ? `${Number(d.cantidad_cpdfa).toFixed(2)} ${d.siglas_inuni}`
            : Number(d.cantidad_cpdfa).toFixed(2);
        return [
            td(d.codigo_inarti ?? '', fill, 'center'),
            td(cantidadTexto, fill, 'center'),
            td(d.observacion_cpdfa || d.nombre_inarti, fill),
            td(Number(d.precio_cpdfa).toFixed(4), fill, 'right'),
            td(fCurrency(Number(d.valor_cpdfa)), fill, 'right'),
        ];
    });

    const tablaDetalles: Content = {
        table: {
            headerRows: 1,
            widths: ['13%', '10%', '*', '13%', '13%'],
            body: [
                [
                    th('Cod. Principal'),
                    th('Cant'),
                    th('Descripción'),
                    th('Precio Unit.', 'right'),
                    th('Precio Total', 'right'),
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

    const base0 = Number(cabecera.base_tarifa0_cpcfa ?? 0);
    const baseNoObjeto = Number(cabecera.base_no_objeto_iva_cpcfa ?? 0);
    const baseGrabada = Number(cabecera.base_grabada_cpcfa ?? 0);
    const valorIva = Number(cabecera.valor_iva_cpcfa ?? 0);
    const descuento = Number(cabecera.descuento_cpcfa ?? 0);
    const total = Number(cabecera.total_cpcfa ?? 0);
    const tarifa = Number(cabecera.tarifa_iva_cpcfa ?? 0) * 100;
    const subtotalSinImpuestos = base0 + baseNoObjeto + baseGrabada;

    const filaResumen = (label: string, valor: number, destacado = false): object[] => [
        {
            text: label,
            style: destacado ? 'totalGrandLabel' : 'totalLabel',
            fillColor: destacado ? RIDE_COLOR.grisTh : RIDE_COLOR.blanco,
            border: [true, false, true, true] as [boolean, boolean, boolean, boolean],
            borderColor: [RIDE_COLOR.grisLinea, '', RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string],
        },
        {
            text: fCurrency(valor),
            style: destacado ? 'totalGrandValor' : 'totalValor',
            fillColor: destacado ? RIDE_COLOR.grisTh : RIDE_COLOR.blanco,
            border: [false, false, true, true] as [boolean, boolean, boolean, boolean],
            borderColor: ['', '', RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string],
        },
    ];

    const colDerecha: Content = {
        table: {
            widths: ['*', 80],
            body: [
                [
                    { text: 'SUBTOTAL SIN IMPUESTOS', style: 'totalLabel', border: [true, true, true, true] as [boolean, boolean, boolean, boolean], borderColor: [RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string] },
                    { text: fCurrency(subtotalSinImpuestos), style: 'totalValor', border: [false, true, true, true] as [boolean, boolean, boolean, boolean], borderColor: ['', RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea, RIDE_COLOR.grisLinea] as [string, string, string, string] },
                ],
                filaResumen('SUBTOTAL 0%', base0),
                filaResumen('SUBTOTAL NO OBJETO IVA', baseNoObjeto),
                filaResumen('DESCUENTO', descuento),
                ...(tarifa > 0 ? [filaResumen(`IVA ${tarifa}%`, valorIva)] : []),
                filaResumen('VALOR TOTAL', total, true),
            ],
        },
        layout: {
            hLineWidth: () => 0.4,
            vLineWidth: () => 0.4,
            hLineColor: () => RIDE_COLOR.grisLinea,
            vLineColor: () => RIDE_COLOR.grisLinea,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            paddingLeft: () => 2,
            paddingRight: () => 2,
        },
    };

    // Forma de pago
    const fpHeader = (text: string): object => ({
        text, fontSize: 7, bold: true, color: RIDE_COLOR.blanco, alignment: 'center',
        fillColor: RIDE_COLOR.negro, border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        margin: [3, 4, 3, 4] as [number, number, number, number],
    });
    const fpCell = (text: string, align: 'left' | 'center' | 'right' = 'left'): object => ({
        text, fontSize: 7.5, color: RIDE_COLOR.negro, alignment: align,
        border: [false, false, false, true] as [boolean, boolean, boolean, boolean],
        borderColor: ['', '', '', RIDE_COLOR.grisLinea] as [string, string, string, string],
        margin: [3, 3, 3, 3] as [number, number, number, number],
    });

    const colIzquierda: Content = {
        stack: [
            buildInfoAdicionalSection([{ nombre: 'Observación', valor: cabecera.observacion_cpcfa }]),
            ...(reembolsos.length > 0
                ? [{
                    stack: [
                        { text: 'Reembolsos', style: 'sectionTitle', margin: [0, 6, 0, 2] as [number, number, number, number] },
                        ...reembolsos.map((r) => {
                            const total = Number(r.base_no_objeto_cpdcr ?? 0) + Number(r.base_tarifa0_cpdcr ?? 0)
                                + Number(r.base_imponible_cpdcr ?? 0) + Number(r.valor_iva_cpdcr ?? 0) + Number(r.valor_ice_cpdcr ?? 0);
                            return {
                                text: `${r.identificacion_cpdcr} — ${r.serie_cpdcr}-${r.secuencial_cpdcr} — ${fCurrency(total)}`,
                                fontSize: 7.5,
                                color: RIDE_COLOR.negro,
                            };
                        }),
                    ],
                } as Content]
                : []),
            {
                table: {
                    widths: ['*', 90],
                    body: [
                        [fpHeader('Forma de Pago'), fpHeader('Total')],
                        [fpCell(cabecera.nombre_cndfp || '---'), fpCell(fCurrency(total), 'right')],
                    ],
                },
                layout: {
                    hLineWidth: () => 0.6,
                    vLineWidth: () => 0,
                    hLineColor: () => RIDE_COLOR.grisLinea,
                    paddingTop: () => 0,
                    paddingBottom: () => 0,
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                },
                margin: [0, 6, 0, 0] as [number, number, number, number],
            } as Content,
        ],
    };

    const seccionBottom: Content = {
        columns: [
            { width: '55%', stack: [colIzquierda], margin: [0, 4, 10, 0] as [number, number, number, number] },
            { width: '45%', stack: [colDerecha] },
        ],
        margin: [0, 4, 0, 0] as [number, number, number, number],
    };

    return {
        pageSize: 'A4',
        pageMargins: [30, 20, 30, 35] as [number, number, number, number],
        styles: rideStyles,
        defaultStyle: { font: 'Inter', fontSize: 9, color: RIDE_COLOR.negro },
        footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount, false),
        content: [
            encabezado,
            panelProveedor,
            tablaDetalles,
            seccionBottom,
        ],
    };
};
