import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { ConteoFisicoInvRep } from './interfcaes/bodega-inv-rep';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate, fDateTime } from 'src/util/helpers/date-util';

// Definición de estilos para el reporte de conteo físico
const styles: StyleDictionary = {
    header: {
        fontSize: 18,
        bold: true,
        margin: [0, 0, 0, 8] as [number, number, number, number],
        color: '#2d3748',
    },
    tableHeader: {
        bold: true,
        fontSize: 10,
        color: '#2d3748',
        fillColor: '#f7fafc',
        alignment: 'center',
    },
    categoriaSmall: {
        fontSize: 8,
        color: '#2d3748',
        margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    value: {
        fontSize: 10,
        color: '#2d3748',
        margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    obs: {
        fontSize: 9,
        color: '#718096',
        italics: true,
        margin: [0, 2, 0, 0] as [number, number, number, number],
    },
    checkBox: {
        margin: [0, 0, 0, 0] as [number, number, number, number],
    },
};

// Función para crear un pequeño cuadrado (checkbox)
const createCheckBox = (): Content => ({
    canvas: [
        {
            type: 'rect',
            x: 0,
            y: 0,
            w: 12,
            h: 12,
            r: 2,
            lineColor: '#2d3748',
            lineWidth: 1,
        },
    ],
    width: 12,
    height: 12,
    style: 'checkBox',
});

// Encabezado de sección
const sectionHeader = (text: string): Content => ({
    text,
    style: 'header',
    alignment: 'center',
    margin: [0, 0, 0, 10] as [number, number, number, number],
});

export const conteoFisicoReport = (
    detalles: ConteoFisicoInvRep[],
    header: Content
): TDocumentDefinitions => {
    // Extraer datos de cabecera del primer detalle
    const cabecera = detalles[0];
    // Tabla de productos a contar
    const detallesContent: Content = {
        table: {
            headerRows: 1,
            widths: [20, '*', 60, 70, 70, 30, 110], // Reduce el ancho de observación para evitar que se salga del margen
            body: [
                [
                    { text: 'N°', style: 'tableHeader' },
                    { text: 'Producto', style: 'tableHeader' },
                    { text: 'Categoría', style: 'tableHeader' },
                    { text: 'Saldo al corte', style: 'tableHeader' },
                    { text: 'Cantidad contada', style: 'tableHeader' },
                    { text: 'OK', style: 'tableHeader' },
                    { text: 'Observación', style: 'tableHeader' },
                ],
                ...detalles.map((detalle, idx) => [
                    { text: idx + 1, alignment: 'center', style: 'value' },
                    { text: detalle.nombre_inarti, style: 'value' },
                    { text: detalle.nombre_incate, style: 'categoriaSmall' },
                    { text: `${detalle.saldo_corte_indcf} ${detalle.siglas_inuni}`, style: 'value', alignment: 'right' },
                    { text: '', style: 'value' }, // Cantidad contada (manual)
                    createCheckBox(), // OK
                    { text: '', style: 'obs' }, // Observación (manual)
                ]),
            ],
        },
        layout: {
            hLineWidth: (i: number) => (i === 0 ? 1 : 0.3),
            vLineWidth: () => 0.3,
            hLineColor: (i: number) => (i === 0 ? '#2d3748' : '#e2e8f0'),
            vLineColor: () => '#e2e8f0',
            paddingTop: () => 5,
            paddingBottom: () => 5,
            paddingLeft: () => 5,
            paddingRight: () => 5,
        },
        margin: [0, 10, 0, 0] as [number, number, number, number],
    };

    // Información de cabecera (extraída del primer detalle)
    const cabeceraContent: Content = {
        stack: [
            sectionHeader('LISTADO DE PRODUCTOS PARA CONTEO FÍSICO'),
            {
                columns: [
                    {
                        width: '60%',
                        stack: [
                            { text: `Bodega: ${cabecera?.nombre_inbod ?? ''}`, style: 'value' },
                            { text: `Fecha corte: ${fDate(cabecera?.fecha_corte_inccf) ?? ''}`, style: 'value' },
                            { text: `Saldos a la fecha: ${fDateTime(cabecera?.fecha_ingre) ?? ''}`, style: 'value' },
                        ],
                    },
                    {
                        width: '40%',
                        stack: [
                            { text: `Secuencial: ${cabecera?.secuencial_inccf ?? ''}`, style: 'value' },
                            { text: `Estado: ${cabecera?.nombre_inec ?? ''}`, style: 'value' },
                            { text: `Total Productos: ${cabecera?.productos_estimados_inccf ?? ''}`, style: 'value' },
                        ],
                        alignment: 'right',
                    },
                ],
            },
        ],
        margin: [0, 0, 0, 0] as [number, number, number, number],
    };

    // Pie de página con instrucciones para firma y responsable
    const nombreResponsable = (cabecera?.nom_usua ?? '').toString().toUpperCase();
    const extraFooterContent: Content = {
        stack: [
            // Línea horizontal
            {
                canvas: [
                    { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1 }
                ],
                margin: [0, 30, 0, 8]
            },
            // Título en negrita
            { text: 'Responsable del Conteo Físico', bold: true, fontSize: 12, margin: [0, 0, 0, 2] },
            // Nombre subrayado en la misma línea
            {
                columns: [
                    { text: `Nombre: ${nombreResponsable}`, fontSize: 11, margin: [0, 0, 0, 0] },
                ],
                columnGap: 4,
                margin: [0, 0, 0, 0]
            },
        ],
        alignment: 'left',
        margin: [0, 40, 0, 0],
    };

    return {
        styles,
        pageMargins: [40, 20, 40, 40] as [number, number, number, number],
        content: [
            header,
            cabeceraContent,
            detallesContent,
            extraFooterContent,
        ],
        footer: (currentPage: number, pageCount: number) =>
            footerSection(currentPage, pageCount, true),
        defaultStyle: {
            fontSize: 10,
        },
        info: {
            title: 'Reporte de Conteo Físico de Inventario',
            author: 'Sistema ProERP',
            subject: 'Inventario',
            keywords: 'inventario, conteo, reporte',
        },
    };
};
