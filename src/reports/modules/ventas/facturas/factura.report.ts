import fs from 'node:fs';
import path from 'node:path';

import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate } from 'src/util/helpers/date-util';
import { getStaticImage } from 'src/util/helpers/file-utils';

import { FacturaDetalle, FacturaRep, TransporteFactura } from './interfaces/factura-rep';

// ── Paleta ────────────────────────────────────────────────────────────────
const GRIS_TH = '#e8e8e8';
const GRIS_FILA = '#f7f7f7';
const GRIS_LINEA = '#cccccc';
const NEGRO = '#1a1a1a';
const BLANCO = '#ffffff';
const GRIS_TEXTO = '#666666';
const GRIS_CLARO = '#fafafa';
const AZUL = '#2563eb';

// ── Estilos ────────────────────────────────────────────────────────────────
const styles: StyleDictionary = {
    panelLabel: {
        fontSize: 7.5,
        bold: true,
        color: GRIS_TEXTO,
    },
    panelValue: {
        fontSize: 7.5,
        color: NEGRO,
    },
    facturaTitle: {
        fontSize: 16,
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
        fontSize: 7,
        bold: true,
        color: GRIS_TEXTO,
        margin: [0, 3, 0, 1] as [number, number, number, number],
    },
    authValue: {
        fontSize: 7.5,
        color: NEGRO,
        margin: [0, 0, 0, 2] as [number, number, number, number],
    },
    claveAccesoText: {
        fontSize: 6.5,
        color: GRIS_TEXTO,
        characterSpacing: 0.8,
        alignment: 'center',
    },
    campoLabel: {
        fontSize: 7.5,
        bold: true,
        color: GRIS_TEXTO,
    },
    campoValor: {
        fontSize: 7.5,
        color: NEGRO,
    },
    thTexto: {
        fontSize: 7.5,
        bold: true,
        color: BLANCO,
        alignment: 'center',
    },
    tdTexto: {
        fontSize: 7.5,
        color: NEGRO,
    },
    sectionTitle: {
        fontSize: 9,
        bold: true,
        color: NEGRO,
        margin: [0, 0, 0, 6] as [number, number, number, number],
    },
    sectionSubtitle: {
        fontSize: 8,
        bold: true,
        color: GRIS_TEXTO,
        margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    totalLabel: {
        fontSize: 8,
        color: NEGRO,
        alignment: 'left',
        margin: [4, 2, 4, 2] as [number, number, number, number],
    },
    totalValor: {
        fontSize: 8,
        color: NEGRO,
        alignment: 'right',
        margin: [4, 2, 4, 2] as [number, number, number, number],
    },
    totalGrandLabel: {
        fontSize: 10,
        bold: true,
        color: NEGRO,
        alignment: 'left',
        margin: [4, 4, 4, 4] as [number, number, number, number],
    },
    totalGrandValor: {
        fontSize: 10,
        bold: true,
        color: NEGRO,
        alignment: 'right',
        margin: [4, 4, 4, 4] as [number, number, number, number],
    },
    statusBadge: {
        fontSize: 7,
        bold: true,
        color: BLANCO,
        alignment: 'center',
    },
    transportLabel: {
        fontSize: 7,
        bold: true,
        color: GRIS_TEXTO,
    },
    transportValue: {
        fontSize: 7.5,
        color: NEGRO,
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
    fillColor: NEGRO,
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    margin: [4, 5, 4, 5] as [number, number, number, number],
});

const td = (
    text: string | number,
    fill: string,
    align: 'left' | 'center' | 'right' = 'left',
    bold = false,
): object => ({
    text: String(text),
    fontSize: 7.5,
    color: NEGRO,
    bold,
    alignment: align,
    fillColor: fill,
    border: [false, false, false, true] as [boolean, boolean, boolean, boolean],
    borderColor: ['', '', '', GRIS_LINEA] as [string, string, string, string],
    margin: [4, 3, 4, 3] as [number, number, number, number],
});

const VALID_IMG_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MIME_MAP: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

function getImageDataUrl(filePath: string): string | null {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    if (!VALID_IMG_EXTS.includes(ext)) return null;
    try {
        const buffer = fs.readFileSync(filePath);
        return `data:${MIME_MAP[ext] || 'image/png'};base64,${buffer.toString('base64')}`;
    } catch {
        return null;
    }
}

function buildTransportSection(transporte: TransporteFactura | null | undefined): Content {
    if (!transporte) {
        return { text: '', margin: [0, 0, 0, 0] as [number, number, number, number] };
    }

    const isPropio = transporte.es_transporte_propio_cctfa === true;
    const isFletePagado = transporte.flete_pagado_cctfa === true;

    const detailParts: Content[] = [];

    if (isPropio && transporte.placa_gecam) {
        detailParts.push({ text: `Placa: ${transporte.placa_gecam}`, fontSize: 7, color: NEGRO });
    }
    if (isPropio && transporte.chofer) {
        detailParts.push({ text: `Chofer: ${transporte.chofer}`, fontSize: 7, color: NEGRO });
    }
    if (!isPropio && transporte.nombre_vgtra) {
        detailParts.push({ text: `Transportista: ${transporte.nombre_vgtra}`, fontSize: 7, color: NEGRO });
    }
    if (transporte.comentario_cctfa) {
        detailParts.push({ text: `Obs: ${transporte.comentario_cctfa}`, fontSize: 7, color: NEGRO });
    }

    const fleteLabel = isFletePagado ? 'FLETE PAGADO' : 'FLETE AL COBRO';
    detailParts.push({ text: fleteLabel, fontSize: 7.5, bold: true, color: NEGRO });

    const pipeSep = { text: ' | ', fontSize: 7, color: GRIS_TEXTO };

    const inlineItems: Content[] = [];
    detailParts.forEach((part, idx) => {
        if (idx > 0) inlineItems.push(pipeSep);
        inlineItems.push(part);
    });

    return {
        stack: [
            { text: 'Transporte / Envío', style: 'sectionTitle', margin: [0, 0, 0, 2] as [number, number, number, number] },
            {
                text: inlineItems,
                lineHeight: 1.3,
                margin: [0, 0, 0, 2] as [number, number, number, number],
            },
        ],
        margin: [0, 4, 0, 0] as [number, number, number, number],
    } as Content;
}

// ── Función principal ──────────────────────────────────────────────────────
export const facturaElectronicaReport = (
    data: FacturaRep,
    empresa: Empresa,
    barcodeDataUrl?: string,
): TDocumentDefinitions => {
    const { cabecera, detalles, pagos, transporte } = data;

    const nroFactura = fmtNumero(
        cabecera.establecimiento_ccdfa,
        cabecera.pto_emision_ccdfa,
        cabecera.secuencial_cccfa,
    );

    const claveAcceso = cabecera.claveacceso_srcom ?? '';

    let empresaLogoDataUrl: string | null = null;
    try {
        empresaLogoDataUrl = getImageDataUrl(
            getStaticImage(empresa.logotipo_empr || 'no-image'),
        );
    } catch {
        // logo opcional — si falla se omite
    }

    // ── 1. ENCABEZADO ──────────────────────────────────────────────────────
    // Panel izquierdo: logo + datos de la empresa (fondo blanco)
    const colEmpresa: Content = {
        stack: [
            ...(empresaLogoDataUrl
                ? [{
                    image: empresaLogoDataUrl,
                    width: 100,
                    height: 100,
                    fit: [100, 100],
                    alignment: 'center',
                    margin: [0, 6, 0, 8] as [number, number, number, number],
                }]
                : []),
            {
                columns: [
                    { text: 'Emisor: ', style: 'panelLabel', width: 'auto' },
                    { text: empresa.nom_empr ?? '', style: 'panelValue', width: '*' },
                ],
                margin: [0, 1, 0, 1] as [number, number, number, number],
            },
            {
                columns: [
                    { text: 'RUC: ', style: 'panelLabel', width: 'auto' },
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
        fillColor: BLANCO,
        margin: [0, 0, 0, 0] as [number, number, number, number],
    };

    // Panel derecho: FACTURA + autorización + clave + barcode
    const colComprobante: Content = {
        stack: [
            {
                columns: [
                    { text: 'FACTURA', style: 'facturaTitle', width: '*' },
                    { text: `No.${nroFactura}`, style: 'facturaNumero', width: 'auto' },
                ],
                margin: [0, 6, 0, 8] as [number, number, number, number],
            },
            ...(cabecera.autorizacion_srcomn
                ? [
                    { text: 'Número de Autorización:', style: 'authLabel' },
                    { text: cabecera.autorizacion_srcomn, style: 'authValue' },
                    { text: 'Fecha y hora de Autorización:', style: 'authLabel' },
                    {
                        text: cabecera.fechaautoriza_srcom
                            ? fDate(cabecera.fechaautoriza_srcom, 'dd/MM/yyyy HH:mm:ss')
                            : '',
                        style: 'authValue',
                    },
                ]
                : [
                    { text: ' ', margin: [0, 12, 0, 0] as [number, number, number, number] },
                ]),
            {
                columns: [
                    { stack: [{ text: 'Ambiente:', style: 'authLabel' }, { text: 'PRODUCCIÓN', style: 'authValue' }], width: '50%' },
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
                        fillColor: BLANCO,
                        margin: [8, 0, 8, 8] as [number, number, number, number],
                    },
                    {
                        ...colComprobante,
                        border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
                        borderColor: ['', GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
                        fillColor: GRIS_CLARO,
                        margin: [10, 0, 8, 8] as [number, number, number, number],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
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
            },
        ],
        margin: [0, 1.5, 0, 1.5] as [number, number, number, number],
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
                        fillColor: BLANCO,
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
                        fillColor: BLANCO,
                        margin: [6, 5, 6, 5] as [number, number, number, number],
                    },
                ],
            ],
        },
        layout: {
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
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
        const cantidadTexto = d.siglas_inuni
            ? `${d.cantidad_format ?? parseFloat(String(d.cantidad_ccdfa)).toFixed(2)} ${d.siglas_inuni}`
            : (d.cantidad_format ?? parseFloat(String(d.cantidad_ccdfa)).toFixed(2));
        return [
            td(cantidadTexto, fill, 'center'),
            td(d.nombre_inarti, fill),
            td(parseFloat(String(d.precio_ccdfa)).toFixed(4), fill, 'right'),
            td(fCurrency(parseFloat(String(d.total_ccdfa))), fill, 'right'),
        ];
    });

    const tablaDetalles: Content = {
        table: {
            headerRows: 1,
            widths: ['15%', '*', '13%', '13%'],
            body: [
                [
                    th('Cantidad'),
                    th('Descripción'),
                    th('Precio Unit.', 'right'),
                    th('Total', 'right'),
                ],
                ...cuerpoDetalles,
            ],
        },
        layout: {
            hLineWidth: (i: number, node: any) => i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
            vLineWidth: () => 0,
            hLineColor: () => GRIS_LINEA,
            vLineColor: () => GRIS_LINEA,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
    };

    // ── 4. BOTTOM: info adicional + transporte + pagos (izq) | totales (der) ─
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

    // ── Información Adicional ───────────────────────────────────────────────
    const infoAdicRows: object[][] = [];

    if (cabecera.infoadicional1_srcom) {
        infoAdicRows.push([
            { text: 'Vendedor:', fontSize: 7.5, bold: true, color: GRIS_TEXTO, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], width: '30%' },
            { text: cabecera.infoadicional1_srcom, fontSize: 7.5, color: NEGRO, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
        ]);
    }
    if (cabecera.infoadicional2_srcom) {
        infoAdicRows.push([
            { text: 'Forma de Pago:', fontSize: 7.5, bold: true, color: GRIS_TEXTO, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], width: '30%' },
            { text: cabecera.infoadicional2_srcom, fontSize: 7.5, color: NEGRO, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
        ]);
    }
    if (cabecera.infoadicional3_srcom) {
        infoAdicRows.push([
            { text: 'Observación:', fontSize: 7.5, bold: true, color: GRIS_TEXTO, border: [false, false, false, false] as [boolean, boolean, boolean, boolean], width: '30%' },
            { text: cabecera.infoadicional3_srcom, fontSize: 7.5, color: NEGRO, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
        ]);
    }

    const infoAdicionalSection: Content = {
        stack: [
            { text: 'Información Adicional', style: 'sectionTitle' },
            ...(infoAdicRows.length > 0
                ? [{
                    table: {
                        widths: ['30%', '*'],
                        body: infoAdicRows,
                    },
                    layout: 'noBorders',
                    margin: [0, 0, 0, 0] as [number, number, number, number],
                } as Content]
                : []),
        ],
    };

    // ── Forma de pago (SRI) ─────────────────────────────────────────────────
    const formaPagoNombre = cabecera.nombre_forma_cobro || cabecera.nombre_cndfp || '';
    const diasCredito = cabecera.dias_credito_srcom ?? cabecera.dias_credito_cccfa ?? 0;

    const fpHeader = (text: string): object => ({
        text,
        fontSize: 7,
        bold: true,
        color: BLANCO,
        alignment: 'center',
        fillColor: NEGRO,
        border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        margin: [3, 4, 3, 4] as [number, number, number, number],
    });

    const fpCell = (text: string, align: 'left' | 'center' | 'right' = 'left'): object => ({
        text,
        fontSize: 7.5,
        color: NEGRO,
        alignment: align,
        border: [false, false, false, true] as [boolean, boolean, boolean, boolean],
        borderColor: ['', '', '', GRIS_LINEA] as [string, string, string, string],
        margin: [3, 3, 3, 3] as [number, number, number, number],
    });

    const formaPagoBody = [
        [fpHeader('Forma de Pago'), fpHeader('Total'), fpHeader('Plazo'), fpHeader('Unidad de Tiempo')],
        [
            fpCell(formaPagoNombre || '---'),
            fpCell(fCurrency(total), 'right'),
            fpCell(String(diasCredito), 'center'),
            fpCell('días', 'center'),
        ],
    ];

    // ── Columna Izquierda ───────────────────────────────────────────────────
    const colIzquierda: Content = {
        stack: [
            infoAdicionalSection,
            {
                table: {
                    widths: ['*', 55, 40, 60],
                    body: formaPagoBody,
                },
                layout: {
                    hLineWidth: () => 0.6,
                    vLineWidth: () => 0,
                    hLineColor: () => GRIS_LINEA,
                    paddingTop: () => 0,
                    paddingBottom: () => 0,
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                },
                margin: [0, 0, 0, 4] as [number, number, number, number],
            } as Content,
            buildTransportSection(transporte),
        ],
    };

    // ── Columna Derecha (Totales) ───────────────────────────────────────────
    const filaResumenTop = (label: string, valor: number): object[] => [
        {
            text: label,
            style: 'totalLabel',
            border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
            borderColor: [GRIS_LINEA, GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
            fillColor: BLANCO,
        },
        {
            text: fCurrency(valor),
            style: 'totalValor',
            border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
            borderColor: ['', GRIS_LINEA, GRIS_LINEA, GRIS_LINEA] as [string, string, string, string],
            fillColor: BLANCO,
        },
    ];

    const colDerecha: Content = {
        table: {
            widths: ['*', 70],
            body: [
                filaResumenTop(`Subtotal ${tarifa}%:`, tarifa > 0 ? baseGrabada : 0),
                filaResumen('Subtotal 0%:', base0),
                filaResumen('Descuentos:', 0),
                ...(tarifa > 0
                    ? [filaResumen(`IVA ${tarifa}%:`, valorIva)]
                    : []),
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
            hLineWidth: () => 0.4,
            vLineWidth: () => 0.4,
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
        pageMargins: [30, 20, 30, 35] as [number, number, number, number],
        styles,
        defaultStyle: {
            font: 'Inter',
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
