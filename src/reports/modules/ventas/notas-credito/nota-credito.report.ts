import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import {
    RIDE_COLOR,
    buildEncabezadoRide,
    buildInfoAdicionalSection,
    buildPanelContraparte,
    campoTexto,
    fmtNumero,
    hairlineTableLayout,
    rideStyles,
    splitNumeroDocumento,
    td,
    th,
} from 'src/reports/common/ride/ride-report.util';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';

import { NotaCreditoRep } from './interfaces/nota-credito-rep';

/** RIDE de la Nota de Crédito (Ficha Técnica SRI), layout de referencia: rep_comp_elec/notaCredito.jrxml. */
export const notaCreditoReport = (
    data: NotaCreditoRep,
    empresa: Empresa,
    barcodeDataUrl?: string,
    ambienteTexto?: string,
): TDocumentDefinitions => {
    const { cabecera, detalles } = data;
    const { estab, ptoEmi, secuencial } = splitNumeroDocumento(cabecera.numero_cpcno);
    const numero = fmtNumero(estab, ptoEmi, secuencial);
    const docModificado = splitNumeroDocumento(cabecera.num_doc_mod_cpcno);

    const encabezado = buildEncabezadoRide({
        titulo: 'NOTA DE CRÉDITO',
        numero,
        empresa,
        claveAcceso: cabecera.claveacceso_srcom,
        numeroAutorizacion: cabecera.autorizacion_srcomn,
        fechaAutorizacion: cabecera.fechaautoriza_srcom,
        barcodeDataUrl,
        ambiente: ambienteTexto,
    });

    const panelCliente = buildPanelContraparte(
        [
            campoTexto('Razón Social / Nombres y Apellidos', cabecera.nom_geper ?? ''),
            campoTexto('Identificación', cabecera.identificac_geper ?? ''),
            campoTexto('Dirección', cabecera.direccion_geper ?? ''),
            campoTexto('Fecha Emisión', cabecera.fecha_emisi_cpcno ? fDate(cabecera.fecha_emisi_cpcno, 'dd/MM/yyyy') : '---'),
        ],
        [
            campoTexto('Comprobante que se Modifica', `${docModificado.estab}-${docModificado.ptoEmi}-${docModificado.secuencial}`),
            campoTexto('Fecha Emisión (Comprobante a Modificar)', cabecera.fecha_emision_mod_cpcno ? fDate(cabecera.fecha_emision_mod_cpcno, 'dd/MM/yyyy') : '---'),
            campoTexto('Razón de Modificación', cabecera.nombre_cpmno ?? ''),
        ],
    );

    const cuerpoDetalles = detalles.map((d, i) => {
        const fill = i % 2 === 0 ? RIDE_COLOR.blanco : RIDE_COLOR.grisFila;
        const cantidadTexto = d.siglas_inuni
            ? `${Number(d.cantidad_cpdno).toFixed(2)} ${d.siglas_inuni}`
            : Number(d.cantidad_cpdno).toFixed(2);
        return [
            td(d.codigo_inarti ?? '', fill, 'center'),
            td(cantidadTexto, fill, 'center'),
            td(d.observacion_cpdno || d.nombre_inarti, fill),
            td(Number(d.precio_cpdno).toFixed(4), fill, 'right'),
            td(fCurrency(Number(d.valor_cpdno)), fill, 'right'),
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
        layout: hairlineTableLayout,
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    const base0 = Number(cabecera.base_tarifa0_cpcno ?? 0);
    const baseNoObjeto = Number(cabecera.base_no_objeto_iva_cpcno ?? 0);
    const baseGrabada = Number(cabecera.base_grabada_cpcno ?? 0);
    const valorIva = Number(cabecera.valor_iva_cpcno ?? 0);
    const total = Number(cabecera.total_cpcno ?? 0);
    const tarifa = Number(cabecera.tarifa_iva_cpcno ?? 0);
    const subtotalSinImpuestos = base0 + baseNoObjeto + baseGrabada;

    const filaResumen = (label: string, valor: number, destacado = false): object[] => [
        {
            text: label,
            style: destacado ? 'totalGrandLabel' : 'totalLabel',
            fillColor: destacado ? RIDE_COLOR.grisTh : RIDE_COLOR.blanco,
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        {
            text: fCurrency(valor),
            style: destacado ? 'totalGrandValor' : 'totalValor',
            fillColor: destacado ? RIDE_COLOR.grisTh : RIDE_COLOR.blanco,
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
    ];

    const colDerecha: Content = {
        table: {
            widths: ['*', 80],
            body: [
                [
                    { text: 'SUBTOTAL SIN IMPUESTOS', style: 'totalLabel', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                    { text: fCurrency(subtotalSinImpuestos), style: 'totalValor', border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                ],
                filaResumen('SUBTOTAL 0%', base0),
                ...(tarifa > 0 ? [filaResumen(`IVA ${tarifa}%`, valorIva)] : []),
                filaResumen('VALOR TOTAL', total, true),
            ],
        },
        layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 6,
            paddingRight: () => 6,
        },
    };

    const seccionBottom: Content = {
        columns: [
            { width: '55%', stack: [buildInfoAdicionalSection([{ nombre: 'Observación', valor: cabecera.observacion_cpcno }])], margin: [0, 4, 10, 0] as [number, number, number, number] },
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
            panelCliente,
            tablaDetalles,
            seccionBottom,
        ],
    };
};
