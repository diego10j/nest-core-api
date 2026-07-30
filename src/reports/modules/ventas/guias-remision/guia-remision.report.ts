import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import {
    RIDE_COLOR,
    buildEncabezadoRide,
    buildPanelContraparte,
    campoTexto,
    fmtNumero,
    hairlineTableLayout,
    rideStyles,
    td,
    th,
} from 'src/reports/common/ride/ride-report.util';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate } from 'src/util/helpers/date-util';

import { GuiaRemisionRep } from './interfaces/guia-remision-rep';

/** RIDE de la Guía de Remisión (Ficha Técnica SRI), layout de referencia: rep_comp_elec/guiaRemisionFinal.jrxml. */
export const guiaRemisionReport = (
    data: GuiaRemisionRep,
    empresa: Empresa,
    barcodeDataUrl?: string,
    ambienteTexto?: string,
): TDocumentDefinitions => {
    const { cabecera, detalles } = data;
    const numero = (cabecera.estab_srcom && cabecera.ptoemi_srcom && cabecera.secuencial_srcom)
        ? fmtNumero(cabecera.estab_srcom, cabecera.ptoemi_srcom, cabecera.secuencial_srcom)
        : '---';
    const numeroFactura = fmtNumero(cabecera.establecimiento_ccdfa, cabecera.pto_emision_ccdfa, cabecera.secuencial_cccfa);

    const encabezado = buildEncabezadoRide({
        titulo: 'GUÍA DE REMISIÓN',
        numero,
        empresa,
        claveAcceso: cabecera.claveacceso_srcom,
        numeroAutorizacion: cabecera.autorizacion_srcomn,
        fechaAutorizacion: cabecera.fechaautoriza_srcom,
        barcodeDataUrl,
        ambiente: ambienteTexto,
    });

    const transportistaTexto = cabecera.es_transporte_propio_cctfa
        ? `${cabecera.chofer ?? ''} ${cabecera.vehiculo ? `(${cabecera.vehiculo})` : ''}`.trim()
        : (cabecera.nombre_vgtra ?? '');

    const panelTransporte = buildPanelContraparte(
        [
            campoTexto('Identificación (Transportista)', transportistaTexto || '---'),
            campoTexto('Placa', cabecera.placa_gecam ?? ''),
            campoTexto('Punto de Partida', cabecera.punto_partida_ccgui ?? ''),
            campoTexto('Motivo Traslado', cabecera.nombre_cctgi ?? ''),
        ],
        [
            campoTexto('Fecha Inicio Transporte', cabecera.fecha_ini_trasla_ccgui ? fDate(cabecera.fecha_ini_trasla_ccgui, 'dd/MM/yyyy') : '---'),
            campoTexto('Fecha Fin Transporte', cabecera.fecha_fin_trasla_ccgui ? fDate(cabecera.fecha_fin_trasla_ccgui, 'dd/MM/yyyy') : '---'),
            campoTexto('Ruta', `${cabecera.punto_partida_ccgui ?? '---'} → ${cabecera.punto_llegada_ccgui ?? '---'}`),
        ],
    );

    const panelDestinatario = buildPanelContraparte(
        [
            campoTexto('Razón Social / Nombres y Apellidos', cabecera.destinatario_ccgui ?? ''),
            campoTexto('Identificación (Destinatario)', cabecera.destinatario_identificacion ?? ''),
            campoTexto('Destino (Punto de Llegada)', cabecera.punto_llegada_ccgui ?? ''),
        ],
        [
            campoTexto('Comprobante de Venta', numeroFactura),
            campoTexto('Número de Autorización', cabecera.factura_autorizacion ?? '---'),
            campoTexto('Fecha de Emisión', cabecera.fecha_emisi_cccfa ? fDate(cabecera.fecha_emisi_cccfa, 'dd/MM/yyyy') : '---'),
        ],
    );

    const cuerpoDetalles = detalles.map((d, i) => {
        const fill = i % 2 === 0 ? RIDE_COLOR.blanco : RIDE_COLOR.grisFila;
        const cantidadTexto = d.siglas_inuni
            ? `${Number(d.cantidad_ccdfa).toFixed(2)} ${d.siglas_inuni}`
            : Number(d.cantidad_ccdfa).toFixed(2);
        return [
            td(d.codigo_inarti ?? '', fill, 'center'),
            td(cantidadTexto, fill, 'center'),
            td(d.observacion_ccdfa || d.nombre_inarti, fill),
        ];
    });

    const tablaDetalles: Content = {
        table: {
            headerRows: 1,
            widths: ['20%', '15%', '*'],
            body: [
                [
                    th('Cod. Principal'),
                    th('Cantidad'),
                    th('Descripción'),
                ],
                ...cuerpoDetalles,
            ],
        },
        layout: hairlineTableLayout,
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    return {
        pageSize: 'A4',
        pageMargins: [30, 20, 30, 35] as [number, number, number, number],
        styles: rideStyles,
        defaultStyle: { font: 'Inter', fontSize: 9, color: RIDE_COLOR.negro },
        footer: (currentPage: number, pageCount: number) => footerSection(currentPage, pageCount, false),
        content: [
            encabezado,
            panelTransporte,
            panelDestinatario,
            tablaDetalles,
        ],
    };
};
