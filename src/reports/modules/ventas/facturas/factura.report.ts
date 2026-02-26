import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate } from 'src/util/helpers/date-util';
import { fCurrency } from 'src/util/helpers/common-util';
import { getStaticImage } from 'src/util/helpers/file-utils';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';

import { FacturaRep, FacturaDetalle, FacturaPagoDetalle } from './interfaces/factura-rep';

// ── Paleta ────────────────────────────────────────────────────────────────
const GRIS_PANEL = '#d9d9d9';   // fondo panel izquierdo del encabezado
const GRIS_TH = '#d4d4d4';   // fondo cabecera de tabla
const GRIS_FILA = '#f5f5f5';   // fila alterna
const GRIS_LINEA = '#bbbbbb';   // bordes
const NEGRO = '#000000';
const BLANCO = '#ffffff';
const GRIS_TEXTO = '#555555';

// ── Estilos ────────────────────────────────────────────────────────────────
const styles: StyleDictionary = {
    panelLabel: {
        fontSize: 8,
        bold: true,
        color: NEGRO,
    },
    panelValue: {
        fontSize: 8,
        color: NEGRO,
    },
    facturaTitle: {
        fontSize: 14,
        bold: true,
        color: NEGRO,
    },
    facturaNumero: {
        fontSize: 11,
        bold: true,
        color: NEGRO,
        alignment: 'right',
    },
    authLabel: {
        fontSize: 8,
        bold: true,
        color: NEGRO,
        margin: [0, 4, 0, 1] as [number, number, number, number],
    },
    authValue: {
        fontSize: 8,
        color: NEGRO,
        margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    claveAccesoText: {
        fontSize: 7,
        color: GRIS_TEXTO,
        characterSpacing: 0.5,
        alignment: 'center',
    },
    campoLabel: {
        fontSize: 8,
        bold: true,
        color: NEGRO,
    },
    campoValor: {
        fontSize: 8,
        color: NEGRO,
    },
    thTexto: {
        fontSize: 8,
        bold: true,
        color: NEGRO,
        alignment: 'center',
    },
    tdTexto: {
        fontSize: 8,
        color: NEGRO,
    },
    sectionTitle: {
        fontSize: 9,
        bold: true,
        color: NEGRO,
        margin: [0, 0, 0, 3] as [number, number, number, number],
    },
    totalLabel: {
        fontSize: 8,
        color: NEGRO,
        alignment: 'left',
        margin: [3, 2, 3, 2] as [number, number, number, number],
    },
    totalValor: {
        fontSize: 8,
        color: NEGRO,
        alignment: 'right',
        margin: [3, 2, 3, 2] as [number, number, number, number],
    },
    totalGrandLabel: {
        fontSize: 9,
        bold: true,
        color: NEGRO,
        alignment: 'left',
        margin: [3, 3, 3, 3] as [number, number, number, number],
    },
    totalGrandValor: {
        fontSize: 9,
        bold: true,
        color: NEGRO,
        alignment: 'right',
        margin: [3, 3, 3, 3] as [number, number, number, number],
    },
};

// ── Helpers ────────────────────────────────────────────────────────────────
const pad = (v: string | number, n: number) => String(v ?? '').padStart(n, '0');

const fmtNumero = (e: string, p: string, s: string) =>
    `${pad(e, 3)}-${pad(p, 3)}-${pad(s, 9)}`;

const th = (text: string, align: 'left' | 'center' | 'right' = 'center'): object => ({
    text,
    style: 'thTexto',
    alignment: align,
    fillColor: GRIS_TH,
    border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
    borderColor: [GRIS_LINEA, GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
    margin: [4, 4, 4, 4] as [number, number, number, number],
});

const td = (
    text: string | number,
    fill: string,
    align: 'left' | 'center' | 'right' = 'left',
    bold = false,
): object => ({
    text: String(text),
    fontSize: 8,
    color: NEGRO,
    bold,
    alignment: align,
    fillColor: fill,
    border: [false, false, false, true] as [boolean, boolean, boolean, boolean],
    borderColor: ['', '', '', GRIS_LINEA] as [string, string, string, string],
    margin: [4, 3, 4, 3] as [number, number, number, number],
});

// ── Función principal ──────────────────────────────────────────────────────
export const facturaElectronicaReport = (
    data: FacturaRep,
    empresa: Empresa,
    barcodeDataUrl?: string,
): TDocumentDefinitions => {
    const { cabecera, detalles, pagos } = data;

    const nroFactura = fmtNumero(
        cabecera.establecimiento_ccdfa,
        cabecera.pto_emision_ccdfa,
        cabecera.secuencial_cccfa,
    );

    const claveAcceso = cabecera.claveacceso_srcom ?? '';

    // ── 1. ENCABEZADO ──────────────────────────────────────────────────────
    // Panel izquierdo: logo + datos de la empresa (fondo gris)
    const colEmpresa: Content = {
        stack: [
            {
                image: getStaticImage(empresa.logotipo_empr || 'no-image'),
                width: 120,
                height: 60,
                alignment: 'center',
                margin: [0, 6, 0, 8] as [number, number, number, number],
            },
            {
                columns: [
                    { text: 'Emisor: ', style: 'panelLabel', width: 'auto' },
                    { text: empresa.nom_empr ?? '', style: 'panelValue', width: '*' },
                ],
                margin: [0, 1, 0, 1] as [number, number, number, number],
            },
            {
                columns: [
                    { text: 'RUC ', style: 'panelLabel', width: 'auto' },
                    { text: empresa.identificacion_empr ?? '', style: 'panelValue', width: '*' },
                ],
                margin: [0, 1, 0, 1] as [number, number, number, number],
            },
            ...(empresa.direccion_empr
                ? [{
                    columns: [
                        { text: 'Matriz: ', style: 'panelLabel', width: 'auto' },
                        { text: empresa.direccion_empr, style: 'panelValue', width: '*' },
                    ],
                    margin: [0, 1, 0, 1] as [number, number, number, number],
                }]
                : []),
            ...(empresa.mail_empr
                ? [{
                    columns: [
                        { text: 'Correo: ', style: 'panelLabel', width: 'auto' },
                        { text: empresa.mail_empr, style: 'panelValue', width: '*' },
                    ],
                    margin: [0, 1, 0, 1] as [number, number, number, number],
                }]
                : []),
            ...(empresa.telefono_empr
                ? [{
                    columns: [
                        { text: 'Teléfono: ', style: 'panelLabel', width: 'auto' },
                        { text: empresa.telefono_empr, style: 'panelValue', width: '*' },
                    ],
                    margin: [0, 1, 0, 1] as [number, number, number, number],
                }]
                : []),

        ],
        fillColor: GRIS_PANEL,
        margin: [0, 0, 0, 0] as [number, number, number, number],
    };

    // Panel derecho: FACTURA + autorización + clave + barcode (fondo blanco)
    const colComprobante: Content = {
        stack: [
            {
                columns: [
                    { text: 'FACTURA', style: 'facturaTitle', width: '*' },
                    { text: `No.${nroFactura}`, style: 'facturaNumero', width: 'auto' },
                ],
                margin: [0, 6, 0, 8] as [number, number, number, number],
            },
            { text: 'Número de Autorización:', style: 'authLabel' },
            {
                text: cabecera.autorizacion_srcomn ?? 'Pendiente de autorización',
                style: 'authValue',
            },
            { text: 'Fecha y hora de Autorización:', style: 'authLabel' },
            {
                text: cabecera.fechaautoriza_srcom
                    ? fDate(cabecera.fechaautoriza_srcom, 'dd/MM/yyyy HH:mm:ss')
                    : '---',
                style: 'authValue',
            },
            {
                columns: [
                    { stack: [{ text: 'Ambiente:', style: 'authLabel' }, { text: 'PRODUCCION', style: 'authValue' }], width: '50%' },
                    { stack: [{ text: 'Emisión:', style: 'authLabel' }, { text: 'NORMAL', style: 'authValue' }], width: '50%' },
                ],
            },
            ...(claveAcceso
                ? [
                    { text: 'Clave de Acceso:', style: 'authLabel' },
                    ...(barcodeDataUrl
                        ? [
                            {
                                image: barcodeDataUrl,
                                width: 250,
                                height: 45,
                                alignment: 'center' as const,
                                margin: [0, 2, 0, 2] as [number, number, number, number],
                            },
                            {
                                text: claveAcceso,
                                style: 'claveAccesoText',
                                margin: [0, 0, 0, 4] as [number, number, number, number],
                            },
                        ]
                        : [
                            {
                                text: claveAcceso,
                                style: 'claveAccesoText',
                                margin: [0, 2, 0, 4] as [number, number, number, number],
                            },
                        ]),
                ]
                : []),
        ],
        margin: [10, 0, 0, 0] as [number, number, number, number],
    };

    const encabezado: Content = {
        table: {
            widths: ['42%', '58%'],
            body: [
                [
                    {
                        ...colEmpresa,
                        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: [GRIS_LINEA, GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
                        margin: [8, 0, 8, 8] as [number, number, number, number],
                    },
                    {
                        ...colComprobante,
                        border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: ['', GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
                        fillColor: BLANCO,
                        margin: [10, 0, 8, 8] as [number, number, number, number],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
            hLineColor: () => GRIS_LINEA,
            vLineColor: () => GRIS_LINEA,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    // ── 2. DATOS DEL COMPRADOR ─────────────────────────────────────────────
    const campoCliente = (
        label: string,
        valor: string,
        align: 'left' | 'right' = 'left',
    ): object => ({
        columns: [
            {
                text: `${label}:`,
                style: 'campoLabel',
                width: 'auto',
            },
            {
                text: ` ${valor || '---'}`,
                style: 'campoValor',
                width: '*',
                alignment: align,
            },
        ],
        margin: [0, 1, 0, 1] as [number, number, number, number],
    });

    const datosCliente: Content = {
        table: {
            widths: ['*', '*'],
            body: [
                [
                    {
                        stack: [
                            campoCliente('Razón Social', cabecera.nom_geper ?? ''),
                            campoCliente('Dirección', cabecera.direccion_geper ?? ''),
                            campoCliente('Fecha Emisión',
                                cabecera.fecha_emisi_cccfa
                                    ? fDate(cabecera.fecha_emisi_cccfa, 'dd/MM/yyyy')
                                    : '---'),
                        ],
                        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: [GRIS_LINEA, GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
                        margin: [6, 5, 6, 5] as [number, number, number, number],
                    },
                    {
                        stack: [
                            campoCliente('RUC/CI', cabecera.identificac_geper ?? ''),
                            campoCliente('Teléfono', cabecera.telefono_geper ?? ''),
                            campoCliente('Correo', cabecera.correo_geper ?? ''),
                        ],
                        border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: ['', GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
                        margin: [6, 5, 6, 5] as [number, number, number, number],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
            hLineColor: () => GRIS_LINEA,
            vLineColor: () => GRIS_LINEA,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    // ── 3. TABLA DE DETALLES ───────────────────────────────────────────────
    const cuerpoDetalles = detalles.map((d: FacturaDetalle, i: number) => {
        const fill = i % 2 === 0 ? BLANCO : GRIS_FILA;
        return [
            td(d.codigo_inarti, fill, 'left'),
            td(parseFloat(String(d.cantidad_ccdfa)).toFixed(2), fill, 'center'),
            td(d.nombre_inarti, fill),
            td(d.observacion_ccdfa ?? '', fill),
            td(parseFloat(String(d.precio_ccdfa)).toFixed(6), fill, 'right'),
            td(fCurrency(0), fill, 'right'),
            td(fCurrency(parseFloat(String(d.total_ccdfa))), fill, 'right'),
        ];
    });

    const tablaDetalles: Content = {
        table: {
            headerRows: 1,
            widths: ['10%', '8%', '*', '16%', '12%', '9%', '10%'],
            body: [
                [
                    th('Código\nPrincipal'),
                    th('Cantidad'),
                    th('Descripción'),
                    th('Detalles\nAdicionales'),
                    th('Precio\nUnitario', 'right'),
                    th('Descuento', 'right'),
                    th('Total', 'right'),
                ],
                ...cuerpoDetalles,
            ],
        },
        layout: {
            hLineWidth: (i: number, node: any) => i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
            vLineWidth: () => 0.8,
            hLineColor: () => GRIS_LINEA,
            vLineColor: () => GRIS_LINEA,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    // ── 4. BOTTOM: info adicional + pagos (izq) | totales (der) ───────────
    const base0 = parseFloat(String(cabecera.base_tarifa0_cccfa ?? 0));
    const baseNoObjeto = parseFloat(String(cabecera.base_no_objeto_iva_cccfa ?? 0));
    const baseGrabada = parseFloat(String(cabecera.base_grabada_cccfa ?? 0));
    const valorIva = parseFloat(String(cabecera.valor_iva_cccfa ?? 0));
    const total = parseFloat(String(cabecera.total_cccfa ?? 0));
    const tarifa = parseFloat(String(cabecera.tarifa_iva_cccfa ?? 0));
    const subtotalSinImp = base0 + baseNoObjeto + baseGrabada;

    const filaResumen = (label: string, valor: number): object[] => [
        {
            text: label,
            style: 'totalLabel',
            border: [true, false, true, true] as [boolean, boolean, boolean, boolean],
            borderColor: [GRIS_LINEA, '', GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
            fillColor: BLANCO,
        },
        {
            text: fCurrency(valor),
            style: 'totalValor',
            border: [false, false, true, true] as [boolean, boolean, boolean, boolean],
            borderColor: ['', '', GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
            fillColor: BLANCO,
        },
    ];

    // Construir filas de pagos
    const filasPagos: object[][] = (pagos?.detalles ?? []).map((p: FacturaPagoDetalle) => [
        {
            text: p.nombre_tettb ?? '',
            fontSize: 8,
            color: NEGRO,
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        {
            text: fCurrency(parseFloat(String(p.valor_ccdtr))),
            fontSize: 8,
            color: NEGRO,
            alignment: 'right' as const,
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        {
            text: `${cabecera.dias_credito_cccfa ?? 0} días`,
            fontSize: 8,
            color: NEGRO,
            alignment: 'center' as const,
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
    ]);

    // Obtener info adicional de la cabecera (observaciones / guía remisión)
    const infoAdicRows: object[][] = [];
    if (cabecera.observacion_cccfa) {
        infoAdicRows.push([
            {
                text: 'Descripción',
                fontSize: 8,
                bold: true,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                width: '30%',
            },
            {
                text: cabecera.observacion_cccfa,
                fontSize: 8,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
        ]);
    }

    const colIzquierda: Content = {
        stack: [
            {
                text: 'Información Adicional',
                style: 'sectionTitle',
            },
            ...(infoAdicRows.length > 0
                ? [{
                    table: {
                        widths: ['30%', '*'],
                        body: infoAdicRows,
                    },
                    layout: 'noBorders',
                    margin: [0, 0, 0, 8] as [number, number, number, number],
                } as Content]
                : [{ text: '', margin: [0, 0, 0, 8] as [number, number, number, number] }]),
            {
                text: 'Formas de pago',
                style: 'sectionTitle',
            },
            ...(filasPagos.length > 0
                ? [{
                    table: {
                        widths: ['*', 55, 45],
                        body: filasPagos,
                    },
                    layout: 'noBorders',
                } as Content]
                : [{ text: '', fontSize: 8, color: GRIS_TEXTO }]),
        ],
    };

    const colDerecha: Content = {
        table: {
            widths: ['*', 65],
            body: [
                filaResumen('Subtotal Sin Impuestos:', subtotalSinImp),
                filaResumen(`Subtotal ${tarifa === 15 ? '15%' : tarifa === 5 ? '5%' : tarifa + '%'}:`, tarifa > 0 ? baseGrabada : 0),
                filaResumen(`Subtotal ${tarifa !== 15 ? '15%' : '5%'}:`, 0),
                filaResumen('Subtotal 0%:', base0),
                filaResumen('Subtotal No Objeto IVA:', baseNoObjeto),
                filaResumen('Descuentos:', 0),
                filaResumen('ICE:', 0),
                filaResumen(`IVA ${tarifa === 15 ? '15%' : tarifa + '%'}:`, tarifa > 0 ? valorIva : 0),
                filaResumen(`IVA ${tarifa !== 15 ? '15%' : '5%'}:`, tarifa !== 15 ? valorIva : 0),
                [
                    {
                        text: 'VALOR TOTAL',
                        style: 'totalGrandLabel',
                        fillColor: GRIS_TH,
                        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: [GRIS_LINEA, GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
                    },
                    {
                        text: fCurrency(total),
                        style: 'totalGrandValor',
                        bold: true,
                        fillColor: GRIS_TH,
                        border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: ['', GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => GRIS_LINEA,
            vLineColor: () => GRIS_LINEA,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            paddingLeft: () => 2,
            paddingRight: () => 2,
        },
    };

    const seccionBottom: Content = {
        columns: [
            { width: '55%', stack: [colIzquierda], margin: [0, 4, 10, 0] as [number, number, number, number] },
            { width: '45%', stack: [colDerecha] },
        ],
        margin: [0, 4, 0, 0] as [number, number, number, number],
    };

    // ── DOCUMENTO FINAL ────────────────────────────────────────────────────
    return {
        pageSize: 'A4',
        pageMargins: [35, 20, 35, 35] as [number, number, number, number],
        styles,
        defaultStyle: {
            font: 'Roboto',
            fontSize: 9,
            color: NEGRO,
        },
        footer: (currentPage: number, pageCount: number) =>
            footerSection(currentPage, pageCount, false),
        content: [
            encabezado,
            datosCliente,
            tablaDetalles,
            seccionBottom,
        ],
    };
};
