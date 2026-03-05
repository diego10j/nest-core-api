import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate, fTime } from 'src/util/helpers/date-util';
import { fCurrency } from 'src/util/helpers/common-util';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { ResumenDiarioRep } from './interfaces/resumen-diario-rep';

// ── Paleta ejecutiva (sofisticada, alto contraste) ────────────────────────
const NAVY = '#0f172a';   // Azul noche — títulos y encabezados
const NAVY_LIGHT = '#1e293b';   // Azul noche suave — cuerpo de tablas
const INDIGO = '#4f46e5';   // Índigo vivo — acento primario
const INDIGO_MID = '#6366f1';   // Índigo medio — barras / gráficas
const SLATE_700 = '#334155';   // Slate oscuro
const SLATE_500 = '#64748b';   // Slate medio — subtítulos / captions
const SLATE_400 = '#94a3b8';   // Slate claro — texto secundario
const SLATE_200 = '#e2e8f0';   // Slate muy claro — líneas divisoras
const SLATE_100 = '#f1f5f9';   // Slate background
const SLATE_50 = '#f8fafc';   // Fondo alternado filas
const WHITE = '#ffffff';

// Estado: verde esmeralda / ámbar / rojo
const GREEN_700 = '#15803d';
const GREEN_50 = '#f0fdf4';
const AMBER_700 = '#b45309';
const AMBER_50 = '#fffbeb';
const RED_700 = '#b91c1c';
const RED_50 = '#fef2f2';

// ── Estilos tipográficos ejecutivos ───────────────────────────────────────
const styles: StyleDictionary = {
    // ── Encabezados de sección
    sectionTitle: {
        fontSize: 7,
        bold: true,
        color: SLATE_400,
        characterSpacing: 1.5,
        margin: [0, 14, 0, 8],
    },
    sectionTitleDark: {
        fontSize: 7,
        bold: true,
        color: SLATE_500,
        characterSpacing: 1.5,
        margin: [0, 14, 0, 8],
    },
    // ── KPI Cards
    kpiLabel: {
        fontSize: 7,
        bold: true,
        color: SLATE_500,
        characterSpacing: 1,
    },
    kpiValue: {
        fontSize: 20,
        bold: true,
        color: NAVY,
    },
    kpiValueLg: {
        fontSize: 24,
        bold: true,
        color: NAVY,
    },
    kpiCaption: {
        fontSize: 7,
        color: SLATE_400,
        margin: [0, 3, 0, 0],
    },
    kpiDelta: {
        fontSize: 7.5,
        bold: true,
        margin: [0, 3, 0, 0],
    },
    // ── Tabla detalle
    tableHeader: {
        fontSize: 7,
        bold: true,
        color: SLATE_500,
        characterSpacing: 0.8,
        margin: [6, 6, 6, 6],
    },
    tableCell: {
        fontSize: 7.5,
        color: NAVY_LIGHT,
        margin: [6, 5, 6, 5],
    },
    tableCellMuted: {
        fontSize: 7.5,
        color: SLATE_500,
        margin: [6, 5, 6, 5],
    },
    // ── Gráficas / barras
    barLabel: {
        fontSize: 7.5,
        color: SLATE_700,
    },
    barValue: {
        fontSize: 8.5,
        bold: true,
        color: NAVY,
    },
    barCaption: {
        fontSize: 7,
        color: SLATE_400,
    },
    // ── Badge estado
    badge: {
        fontSize: 6.5,
        bold: true,
        characterSpacing: 0.5,
        margin: [5, 2, 5, 2],
    },
};

// ── Helpers de construcción ───────────────────────────────────────────────

/**
 * Separador horizontal sutil
 */
const divider = (mt = 8, mb = 8): Content => ({
    canvas: [{
        type: 'line', x1: 0, y1: 0, x2: 515, y2: 0,
        lineWidth: 0.5, lineColor: SLATE_200,
    }],
    margin: [0, mt, 0, mb],
});

/**
 * Línea de acento gruesa para encabezados de bloque
 */
const accentRule = (mt = 0): Content => ({
    canvas: [{
        type: 'rect', x: 0, y: 0, w: 28, h: 2,
        color: INDIGO,
    }],
    margin: [0, mt, 0, 6],
});

/**
 * Etiqueta de sección con línea de acento
 */
const sectionHeader = (title: string, mt = 14): Content => ({
    stack: [
        accentRule(mt),
        { text: title.toUpperCase(), style: 'sectionTitle' },
    ],
});

/**
 * KPI Card premium — con fondo sutil y barra de acento izquierda
 */
const kpiCard = (
    label: string,
    value: string | number,
    caption?: string,
    large = false,
    accentColor = INDIGO,
): Content => {
    const cardItems: Content[] = [
        {
            text: label.toUpperCase(),
            style: 'kpiLabel',
            margin: [0, 0, 0, 5],
        } as Content,
        {
            text: value,
            style: large ? 'kpiValueLg' : 'kpiValue',
        } as Content,
    ];

    if (caption) {
        cardItems.push({
            text: caption,
            style: 'kpiCaption',
        } as Content);
    }

    return {
        stack: [{
            columns: [
                // Barra lateral de acento
                {
                    width: 3,
                    canvas: [{
                        type: 'rect', x: 0, y: 0, w: 3,
                        h: large ? 72 : 58,
                        color: accentColor,
                    }],
                },
                // Contenido
                {
                    width: '*',
                    stack: cardItems,
                    margin: [10, 8, 8, 8],
                },
            ],
            // Fondo muy sutil
        }],
        margin: [0, 0, 6, 0],
    };
};

/**
 * KPI compacto para fila secundaria
 */
const kpiCompact = (
    label: string,
    value: string | number,
    sub?: string,
): Content => ({
    stack: [
        {
            text: label.toUpperCase(),
            style: 'kpiLabel',
            margin: [0, 0, 0, 4],
        },
        {
            text: value,
            fontSize: 15,
            bold: true,
            color: NAVY,
        },
        ...(sub ? [{ text: sub, style: 'kpiCaption' } as Content] : []),
    ],
    margin: [0, 0, 0, 0],
});

/**
 * Barra de progreso horizontal (Top N)
 * - pct se calcula sobre totalGeneral (total del período), NO sobre el máximo del ranking
 */
const barRow = (
    label: string,
    subLabel: string,
    value: number,
    maxBar: number,       // Para el ancho visual de la barra (el item #1)
    totalGeneral: number, // Para el % real sobre el total del período
    rank: number,
): Content => {
    const pctBar = maxBar > 0 ? Math.min(100, (value / maxBar) * 100) : 0;
    const pctDisplay = totalGeneral > 0 ? ((value / totalGeneral) * 100).toFixed(1) : '0.0';
    const BAR_W = 160;

    return {
        columns: [
            // Número de rank
            {
                width: 16,
                stack: [{
                    text: `${rank}`,
                    fontSize: 9,
                    bold: true,
                    color: rank === 1 ? INDIGO : SLATE_400,
                    margin: [0, 2, 0, 0],
                }],
            },
            // Nombre + barra
            {
                width: '*',
                stack: [
                    { text: label, style: 'barLabel', margin: [0, 0, 0, 2] },
                    { text: subLabel, style: 'barCaption', margin: [0, 0, 0, 4] },
                    {
                        canvas: [
                            // Track
                            { type: 'rect', x: 0, y: 0, w: BAR_W, h: 5, color: SLATE_200 },
                            // Fill (proporcional al #1, solo visual)
                            { type: 'rect', x: 0, y: 0, w: BAR_W * (pctBar / 100), h: 5, color: INDIGO_MID },
                        ],
                    },
                ],
            },
            // Valor
            {
                width: 76,
                stack: [
                    { text: fCurrency(value), style: 'barValue', alignment: 'right' },
                    {
                        text: `${pctDisplay}% del total`,
                        style: 'barCaption',
                        alignment: 'right',
                        margin: [0, 2, 0, 0],
                    },
                ],
            },
        ],
        margin: [0, 0, 0, 10],
    };
};

/**
 * Fila de tabla compacta sin bordes verticales
 */
const miniTableRow = (
    nombre: string,
    cantidad: number | string,
    total: number,
    isLast = false,
): Content[] => [
        { text: nombre, style: 'tableCell' },
        { text: cantidad.toString(), style: 'tableCell', alignment: 'center' },
        {
            text: fCurrency(total),
            style: 'tableCell',
            alignment: 'right',
            bold: true,
            color: NAVY,
        },
    ];

/**
 * Badge de estado de factura con forma de pago opcional
 */
const estadoBadge = (
    estado: string,
    saldo: number,
    formaPago?: string,
): Content => {
    let bgColor = SLATE_100;
    let txtColor = SLATE_700;

    if (estado === 'PAGADA') {
        bgColor = GREEN_50;
        txtColor = GREEN_700;
    } else if (estado === 'POR PAGAR') {
        bgColor = AMBER_50;
        txtColor = AMBER_700;
    } else if (estado === 'ANULADA') {
        bgColor = RED_50;
        txtColor = RED_700;
    }

    const items: Content[] = [
        {
            text: estado,
            style: 'badge',
            color: txtColor,
            fillColor: bgColor,
            alignment: 'center',
        } as Content,
    ];

    if (saldo > 0) {
        items.push({
            text: `Saldo: ${fCurrency(saldo)}`,
            fontSize: 6.5,
            color: AMBER_700,
            alignment: 'center',
            margin: [0, 2, 0, 0],
        } as Content);
    }

    if (formaPago) {
        items.push({
            text: formaPago,
            fontSize: 6,
            color: SLATE_400,
            alignment: 'center',
            margin: [0, 1, 0, 0],
        } as Content);
    }

    return { stack: items };
};

// ── Función principal ──────────────────────────────────────────────────────
export const resumenDiarioFacturasReport = (
    data: ResumenDiarioRep,
    headerSection: Content,
    /**
     * Si el headerSection externo YA incluye el título "Resumen Diario de Ventas",
     * pasar suppressReportTitle = true para evitar que pdfmake lo duplique.
     * Por defecto true porque el header estándar de ProERP ya lo incluye.
     */
    suppressReportTitle = true,
): TDocumentDefinitions => {
    const { metricas, graficas, facturas } = data;

    const fechaResumen = format(new Date(data.fecha), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });

    // Tasa de cobro como % visual
    const tasaCobro = metricas.total_facturado > 0
        ? ((metricas.total_cobrado / metricas.total_facturado) * 100).toFixed(1)
        : '0.0';

    // ── BLOQUE 1: KPIs Financieros Principales ──────────────────────────
    const kpisFinancieros: Content = {
        columns: [
            {
                width: '34%',
                stack: [
                    kpiCard(
                        'Total Facturado',
                        fCurrency(metricas.total_facturado),
                        `${metricas.total_facturas} facturas emitidas`,
                        true,
                        INDIGO,
                    ),
                ],
            },
            {
                width: '33%',
                stack: [
                    kpiCard(
                        'Total Cobrado',
                        fCurrency(metricas.total_cobrado),
                        `Tasa de cobro: ${tasaCobro}%`,
                        true,
                        GREEN_700,
                    ),
                ],
            },
            {
                width: '33%',
                stack: [
                    kpiCard(
                        'Saldo Pendiente',
                        fCurrency(metricas.total_pendiente),
                        `${metricas.facturas_credito} facturas a crédito`,
                        true,
                        AMBER_700,
                    ),
                ],
            },
        ],
        margin: [0, 4, 0, 4],
    };

    // ── BLOQUE 2: KPIs Operativos ──────────────────────────────────────
    const kpisOperativos: Content = {
        stack: [
            divider(4, 10),
            {
                columns: [
                    {
                        width: '25%',
                        stack: [kpiCompact('Facturas Emitidas', metricas.total_facturas.toString())],
                    },
                    {
                        width: '25%',
                        stack: [kpiCompact('Ticket Promedio', fCurrency(metricas.ticket_promedio))],
                    },
                    {
                        width: '25%',
                        stack: [kpiCompact('Retenciones', fCurrency(metricas.total_retenciones))],
                    },
                    {
                        width: '25%',
                        stack: [
                            kpiCompact(
                                'Facturas Anuladas',
                                metricas.facturas_anuladas.toString(),
                                metricas.total_facturas > 0
                                    ? `${((metricas.facturas_anuladas / metricas.total_facturas) * 100).toFixed(1)}% del total`
                                    : undefined,
                            ),
                        ],
                    },
                ],
            },
        ],
        margin: [0, 0, 0, 4],
    };

    // ── BLOQUE 3: Contado vs Crédito ───────────────────────────────────
    const contadoVsCredito: Content = {
        stack: [
            divider(10, 10),
            sectionHeader('Forma de Financiamiento', 0),
            {
                columns: [
                    // Contado
                    {
                        width: '50%',
                        stack: [
                            {
                                columns: [
                                    {
                                        width: 3,
                                        canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: 52, color: INDIGO }],
                                    },
                                    {
                                        width: '*',
                                        stack: [
                                            { text: 'CONTADO', style: 'kpiLabel', margin: [0, 0, 0, 4] },
                                            {
                                                text: fCurrency(metricas.total_contado),
                                                fontSize: 17, bold: true, color: NAVY,
                                                margin: [0, 0, 0, 2],
                                            },
                                            { text: `${metricas.facturas_contado} facturas`, style: 'kpiCaption' },
                                            {
                                                text: metricas.total_facturado > 0
                                                    ? `${((metricas.total_contado / metricas.total_facturado) * 100).toFixed(0)}% del facturado`
                                                    : '',
                                                fontSize: 7, color: INDIGO_MID, margin: [0, 2, 0, 0],
                                            },
                                        ],
                                        margin: [10, 6, 0, 6],
                                    },
                                ],
                            },
                        ],
                        margin: [0, 0, 8, 0],
                    },
                    // Crédito
                    {
                        width: '50%',
                        stack: [
                            {
                                columns: [
                                    {
                                        width: 3,
                                        canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: 52, color: AMBER_700 }],
                                    },
                                    {
                                        width: '*',
                                        stack: [
                                            { text: 'CRÉDITO', style: 'kpiLabel', margin: [0, 0, 0, 4] },
                                            {
                                                text: fCurrency(metricas.total_credito),
                                                fontSize: 17, bold: true, color: NAVY,
                                                margin: [0, 0, 0, 2],
                                            },
                                            { text: `${metricas.facturas_credito} facturas`, style: 'kpiCaption' },
                                            {
                                                text: metricas.total_facturado > 0
                                                    ? `${((metricas.total_credito / metricas.total_facturado) * 100).toFixed(0)}% del facturado`
                                                    : '',
                                                fontSize: 7, color: AMBER_700, margin: [0, 2, 0, 0],
                                            },
                                        ],
                                        margin: [10, 6, 0, 6],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
        margin: [0, 0, 0, 4],
    };

    // ── BLOQUE 4: Top clientes y artículos (se muestran al FINAL, después del detalle) ──
    const maxCliente = graficas.top_clientes[0]?.total || 1;
    const maxArticulo = graficas.top_articulos[0]?.total || 1;
    // totalGeneral para % real sobre el facturado del día
    const totalFacturado = metricas.total_facturado || 1;

    const topClientesContent: Content = {
        stack: [
            sectionHeader('Top 5 Clientes', 0),
            ...graficas.top_clientes.slice(0, 5).map((c, i) =>
                barRow(
                    c.nom_geper,
                    `${c.cantidad_facturas} factura${c.cantidad_facturas !== 1 ? 's' : ''}`,
                    c.total,
                    maxCliente,
                    totalFacturado,
                    i + 1,
                ),
            ),
        ],
    };

    const topArticulosContent: Content = {
        stack: [
            sectionHeader('Top 5 Artículos', 0),
            ...graficas.top_articulos.slice(0, 5).map((a, i) =>
                barRow(
                    a.nombre_inarti,
                    `${a.cantidad_vendida} ${a.siglas_inuni || 'und'}`,
                    a.total,
                    maxArticulo,
                    totalFacturado,
                    i + 1,
                ),
            ),
        ],
    };

    // ── BLOQUE 5: Estado SRI y Formas de Pago ─────────────────────────────
    const tablaMiniLayout = {
        hLineWidth: (i: number, node: any) => {
            if (i === 0 || i === node.table.body.length) return 0;
            if (i === 1) return 1;
            return 0.4;
        },
        vLineWidth: () => 0,
        hLineColor: (i: number) => i === 1 ? SLATE_200 : SLATE_100,
        fillColor: (rowIndex: number) => rowIndex === 0 ? null : rowIndex % 2 === 0 ? SLATE_50 : null,
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 5,
        paddingBottom: () => 5,
    };

    const tablaHeaderRow = (cols: string[]): Content[] =>
        cols.map((c, i) => ({
            text: c.toUpperCase(),
            style: 'tableHeader',
            alignment: i === 0 ? 'left' : i === cols.length - 1 ? 'right' : 'center',
        })) as Content[];

    const estadoSriContent: Content = {
        stack: [
            sectionHeader('Estado SRI', 0),
            {
                table: {
                    widths: ['*', 'auto', 'auto'],
                    body: [
                        tablaHeaderRow(['Estado', 'Cant.', 'Total']),
                        ...graficas.por_estado_sri.map((e) =>
                            miniTableRow(e.nombre, e.cantidad, e.total),
                        ),
                    ],
                },
                layout: tablaMiniLayout,
            },
        ],
    };

    const formasPagoContent: Content = {
        stack: [
            sectionHeader('Formas de Pago', 0),
            {
                table: {
                    widths: ['*', 'auto', 'auto'],
                    body: [
                        tablaHeaderRow(['Forma de Pago', 'Cant.', 'Total']),
                        ...graficas.por_forma_pago.map((fp) =>
                            miniTableRow(fp.nombre, fp.cantidad, fp.total),
                        ),
                    ],
                },
                layout: tablaMiniLayout,
            },
        ],
    };

    // ── BLOQUE 6: Detalle de Facturas ─────────────────────────────────────
    const ROWS_PER_PAGE = 28;
    const totalPages = Math.ceil(facturas.length / ROWS_PER_PAGE);
    const detallePages: Content[] = [];

    for (let page = 0; page < totalPages; page++) {
        const slice = facturas.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
        const isFirst = page === 0;

        detallePages.push({
            stack: [
                isFirst
                    ? ({
                        stack: [
                            divider(12, 0),
                            sectionHeader(
                                totalPages > 1
                                    ? `Detalle de Facturas — Página ${page + 1} de ${totalPages}`
                                    : 'Detalle de Facturas',
                                0,
                            ),
                        ],
                    } as Content)
                    : ({
                        stack: [
                            {
                                text: `DETALLE DE FACTURAS — PÁGINA ${page + 1} DE ${totalPages}`,
                                style: 'sectionTitle',
                                margin: [0, 4, 0, 8],
                            },
                        ],
                    } as Content),
                {
                    table: {
                        // Nº factura fijo | cliente flexible pero acotado | total fijo | estado+pago fijo | vendedor+hora fijo
                        widths: [75, 185, 52, 90, 55],
                        headerRows: 1,
                        keepWithHeaderRows: 1,
                        body: [
                            // Cabecera
                            [
                                { text: 'N° FACTURA', style: 'tableHeader' },
                                { text: 'CLIENTE', style: 'tableHeader' },
                                { text: 'TOTAL', style: 'tableHeader', alignment: 'right' },
                                { text: 'ESTADO / F. PAGO', style: 'tableHeader', alignment: 'center' },
                                { text: 'VENDEDOR', style: 'tableHeader', alignment: 'center' },
                            ],
                            // Filas
                            ...slice.map((fac) => [
                                {
                                    text: `${fac.establecimiento_ccdfa}-${fac.pto_emision_ccdfa}-${String(fac.secuencial_cccfa).padStart(9, '0')}`,
                                    style: 'tableCellMuted',
                                    fontSize: 6.5,
                                },
                                {
                                    text: fac.nom_geper,
                                    style: 'tableCell',
                                    fontSize: 7,
                                },
                                {
                                    text: fCurrency(fac.total_cccfa),
                                    style: 'tableCell',
                                    alignment: 'right',
                                    bold: true,
                                    color: NAVY,
                                },
                                estadoBadge(fac.estado_pago, fac.saldo, fac.nombre_cndfp),
                                // Vendedor + hora en la misma celda
                                {
                                    stack: [
                                        {
                                            text: fac.nombre_vgven || '—',
                                            fontSize: 6,
                                            color: SLATE_500,
                                            alignment: 'center',
                                            margin: [0, 0, 0, 2],
                                        },
                                        {
                                            text: fTime(fac.hora_ingre) || '—',
                                            fontSize: 7,
                                            bold: true,
                                            color: SLATE_700,
                                            alignment: 'center',
                                        },
                                    ],
                                    margin: [2, 3, 2, 3],
                                },
                            ]),
                        ],
                    },
                    layout: {
                        hLineWidth: (i: number, node: any) => {
                            if (i === 0) return 0;
                            if (i === 1) return 1;
                            if (i === node.table.body.length) return 0.5;
                            return 0.3;
                        },
                        vLineWidth: () => 0,
                        hLineColor: (i: number) => i === 1 ? SLATE_200 : SLATE_100,
                        fillColor: (rowIndex: number) =>
                            rowIndex === 0 ? SLATE_50 : rowIndex % 2 === 0 ? SLATE_50 : null,
                        paddingLeft: () => 6,
                        paddingRight: () => 6,
                        paddingTop: () => 5,
                        paddingBottom: () => 5,
                    },
                },
                // Salto de página si no es el último grupo
                page < totalPages - 1
                    ? ({ text: '', pageBreak: 'after' } as Content)
                    : ({ text: '' } as Content),
            ],
            margin: [0, 0, 0, 8],
        });
    }

    // Nota al pie del detalle
    const notaDetalle: Content = facturas.length > 0
        ? {
            text: `Se muestran ${facturas.length} factura${facturas.length !== 1 ? 's' : ''} del día ${fechaResumen}.`,
            fontSize: 7,
            color: SLATE_400,
            italics: true,
            margin: [0, 6, 0, 0],
        }
        : { text: '' };

    // ── Documento final ────────────────────────────────────────────────────
    // El headerSection estándar de ProERP incluye el título del reporte.
    // Para evitar que aparezca duplicado (una vez en el header y otra como
    // elemento de contenido independiente), usamos el headerSection tal cual
    // y NO agregamos ningún título adicional en el cuerpo del documento.
    return {
        pageSize: 'A4',
        pageMargins: [40, 50, 40, 60],
        // Sin propiedad "title" a nivel de documento — evita el tercer render automático de pdfmake
        info: {
            title: 'Resumen Diario de Ventas',
            author: 'ProERP',
        },
        content: [
            // ── Header: solo logo + empresa (sin título — viene sin title desde el servicio)
            headerSection,

            // ── Título único del reporte
            {
                text: 'Resumen Diario de Ventas',
                fontSize: 15,
                bold: true,
                color: '#2d3748',
                alignment: 'center',
                margin: [0, 8, 0, 2],
            },
            // ── Fecha como subtítulo de contexto
            {
                text: fechaResumen.charAt(0).toUpperCase() + fechaResumen.slice(1),
                fontSize: 8,
                color: SLATE_400,
                alignment: 'center',
                margin: [0, 0, 0, 14],
            },

            // ── Fila 1: KPIs financieros principales
            kpisFinancieros,

            // ── Fila 2: KPIs operativos
            kpisOperativos,

            // ── Fila 3: Contado vs Crédito
            contadoVsCredito,

            // ── Fila 4: Estado SRI | Formas de Pago
            divider(10, 10),
            {
                columns: [
                    { width: '48%', stack: [estadoSriContent] },
                    { width: '4%', stack: [] },
                    { width: '48%', stack: [formasPagoContent] },
                ],
                margin: [0, 0, 0, 4],
            },

            // ── Fila 5: Detalle de facturas (primero)
            ...detallePages,
            notaDetalle,

            // ── Fila 6: Top 5 Clientes | Top 5 Artículos (al final, nueva página)
            {
                text: '',
                pageBreak: 'before',
            },
            divider(0, 10),
            {
                columns: [
                    { width: '50%', stack: [topClientesContent] },
                    { width: '2%', stack: [] },
                    { width: '48%', stack: [topArticulosContent] },
                ],
                margin: [0, 0, 0, 4],
            },
        ],

        footer: (currentPage, pageCount) => footerSection(currentPage, pageCount),

        styles,

        defaultStyle: {
            font: 'Roboto',
            fontSize: 8,
            color: NAVY_LIGHT,
        },
    };
};