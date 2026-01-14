import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { SVG_Icons } from 'src/reports/common/icons/svg-icons';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fDate, fTime } from 'src/util/helpers/date-util';

import { ComprobanteInvRep } from './interfaces/comprobante-inv-rep';

// Definición de estilos
const styles: StyleDictionary = {
  header: {
    fontSize: 18,
    bold: true,
    margin: [0, 0, 0, 4] as [number, number, number, number],
    color: '#2d3748',
  },
  subHeader: {
    fontSize: 14,
    bold: true,
    margin: [0, 6, 0, 3] as [number, number, number, number],
    color: '#4a5568',
  },
  sectionHeader: {
    fontSize: 12,
    bold: true,
    margin: [0, 12, 0, 6] as [number, number, number, number],
    color: '#2d3748',
  },
  label: {
    bold: true,
    fontSize: 9,
    color: '#718096',
    margin: [0, 2, 0, 0] as [number, number, number, number],
  },
  value: {
    fontSize: 10,
    margin: [0, 0, 0, 5] as [number, number, number, number],
    color: '#2d3748',
  },
  observ: {
    fontSize: 8,
    margin: [0, 0, 0, 5] as [number, number, number, number],
    color: '#2d3748',
  },
  tableHeader: {
    bold: true,
    fontSize: 9,
    color: '#2d3748',
    fillColor: '#f7fafc',
    alignment: 'center',
  },
  positiveValue: {
    color: '#38a169',
    bold: true,
  },
  negativeValue: {
    color: '#e53e3e',
    bold: true,
  },
  totalRow: {
    bold: true,
    fontSize: 10,
    fillColor: '#f8f9fa',
    color: '#2d3748',
  },
  footerText: {
    fontSize: 8,
    color: '#a0aec0',
    alignment: 'center',
  },
  companyText: {
    fontSize: 9,
    color: '#718096',
    margin: [0, 0, 0, 1] as [number, number, number, number],
  },
  comprobanteNumber: {
    fontSize: 16,
    bold: true,
    color: '#e53e3e',
    margin: [0, 0, 0, 0] as [number, number, number, number],
  },
  badgeLabel: {
    fontSize: 9,
    color: '#718096',
    margin: [0, 0, 0, 3] as [number, number, number, number],
  },
};

// Función auxiliar para crear iconos
const createIcon = (svgString: string, size: number = 12): Content => ({
  svg: svgString,
  width: size,
  height: size,
  margin: [0, 2, 4, 2] as [number, number, number, number],
});

// Función para crear secciones de encabezado
const sectionHeader = (text: string): Content => ({
  text,
  style: 'sectionHeader',
  margin: [0, 12, 0, 6] as [number, number, number, number],
});

export const comprobanteInventarioReport = (comprobante: ComprobanteInvRep, header: Content): TDocumentDefinitions => {
  const { cabecera, detalles } = comprobante;

  // Determinar si es ingreso o egreso
  const isIngreso = cabecera.signo_intci === 1;

  // Título con número de comprobante
  const tituloComprobante: Content = {
    stack: [
      {
        columns: [
          {
            width: '60%',
            text: isIngreso ? `COMPROBANTE DE INVENTARIO (+)` : `COMPROBANTE DE INVENTARIO (-)`,
            style: {
              fontSize: 16,
              bold: true,
              color: '#2d3748',
              margin: [0, 0, 0, 0] as [number, number, number, number],
              alignment: 'right',
            },
          },
          {
            width: '40%',
            text: `N°. ${cabecera.numero_incci}`,
            style: 'comprobanteNumber',
            margin: [10, 0, 0, 0] as [number, number, number, number],
            alignment: 'right',
          },
        ],

        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
    ],
  };

  // Información del comprobante
  const comprobanteInfo: Content = {
    stack: [
      tituloComprobante,
      {
        columns: [
          // Columna izquierda: Información básica
          {
            width: '60%',
            stack: [
              {
                text: 'Fecha:',
                style: {
                  bold: true,
                  fontSize: 10,
                  color: '#718096',
                  margin: [0, 0, 0, 2] as [number, number, number, number],
                },
              },
              {
                text: fDate(cabecera.fecha_trans_incci),
                style: { fontSize: 11, color: '#2d3748', margin: [0, 0, 0, 8] as [number, number, number, number] },
              },
            ],
          },
          // Columna derecha: Estados y badges
          {
            width: '40%',
            stack: [
              {
                text: 'Bodega:',
                style: {
                  bold: true,
                  fontSize: 10,
                  color: '#718096',
                  margin: [0, 0, 0, 2] as [number, number, number, number],
                },
              },
              {
                text: cabecera.nombre_inbod || 'N/A',
                style: { fontSize: 11, color: '#2d3748', margin: [0, 0, 0, 0] as [number, number, number, number] },
              },
            ],
            alignment: 'right',
          },
        ],
      },
    ],
    margin: [0, 0, 0, 5] as [number, number, number, number],
  };

  // Información del cliente/proveedor
  const infoClienteProveedor: Content[] = [
    sectionHeader('INFORMACIÓN DEL ' + (isIngreso ? 'PROVEEDOR' : 'CLIENTE')),
    {
      columns: [
        {
          width: '60%',
          stack: [
            { text: 'Nombre', style: 'label' },
            {
              text: cabecera.nom_geper || 'N/A',
              style: { ...styles.value, margin: [0, 0, 0, 8] as [number, number, number, number] },
            },
            { text: 'Observaciones:', style: 'label' },
            { text: cabecera.observacion_incci || 'Ninguna', style: { ...styles.value } },
          ],
        },
        {
          width: '40%',
          stack: [
            { text: 'Tipo Movimiento:', style: 'label' },
            { text: cabecera.nombre_intti, style: 'value' },
            { text: 'Documento relacionado:', style: 'label' },
            { text: cabecera.num_documento ? `Factura No. ${cabecera.num_documento}` : 'N/A', style: 'value' },
          ],
        },
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
  ];

  // Detalles de productos
  const detallesContent: Content[] = [
    sectionHeader('DETALLES DEL MOVIMIENTO'),
    {
      table: {
        headerRows: 1,
        widths: ['50%', '15%', '10%', '25%'],
        body: [
          [
            { text: 'Producto', style: 'tableHeader' },
            { text: 'Cantidad', style: 'tableHeader' },
            // { text: 'Precio Unit.', style: 'tableHeader' },
            // { text: 'Valor', style: 'tableHeader' },
            { text: 'Verif.', style: 'tableHeader' },
            { text: 'Observación', style: 'tableHeader' },
          ],
          ...detalles.map((detalle) => [
            { text: detalle.observacion_indci, style: 'value' },
            { text: `${detalle.cantidad_indci}  ${detalle.siglas_inuni}`, style: 'value', alignment: 'center' },
            // { text: fCurrency(detalle.precio_indci), style: 'value', alignment: 'right' },
            // {
            //   text: fCurrency(detalle.valor_indci || detalle.precio_indci * detalle.cantidad_indci),
            //   style: 'value',
            //   alignment: 'right'
            // },
            {
              stack: [createIcon(detalle.verifica_indci ? SVG_Icons.CHECK : SVG_Icons.PENDING, 14)],
              alignment: 'center',
            },
            { text: detalle.observ_verifica_indci, style: 'observ' },
          ]),
        ],
      },
      layout: {
        hLineWidth: (i: number) => (i === 0 || i === detalles.length + 1 ? 0.7 : 0.3),
        vLineWidth: () => 0.3,
        hLineColor: (i: number) => (i === 0 || i === 1 || i === detalles.length + 1 ? '#cbd5e0' : '#e2e8f0'),
        vLineColor: () => '#e2e8f0',
        paddingTop: (i: number) => (i === 0 ? 8 : 5),
        paddingBottom: (i: number) => (i === detalles.length ? 8 : 5),
        paddingLeft: () => 5,
        paddingRight: () => 5,
      },
    },
  ];

  // Información adicional con 3 columnas
  const infoAdicionalContent: Content[] = [
    sectionHeader('INFORMACIÓN ADICIONAL'),
    {
      columns: [
        // Primera columna: Información de creación
        {
          width: '33%',
          stack: [
            { text: 'Automático:', style: 'badgeLabel' },
            { text: cabecera.automatico_incci === true ? 'Si' : 'No', style: 'value' },
            { text: 'Verificaco:', style: 'badgeLabel' },
            { text: cabecera.verifica_incci === true ? 'Si' : 'No', style: 'value' },
          ],
        },
        // Segunda columna: Información de verificación
        {
          width: '33%',
          stack: [
            { text: 'Verificado por:', style: 'badgeLabel' },
            { text: cabecera.usuario_verifica_incci || 'N/A', style: 'value' },
            { text: 'Fecha verificación:', style: 'badgeLabel' },
            { text: cabecera.fec_cam_est_incci ? fDate(cabecera.fec_cam_est_incci) : 'N/A', style: 'value' },
          ],
        },
        // Tercera columna: Estados adicionales
        {
          width: '34%',
          stack: [
            { text: 'Usuario crea:', style: 'badgeLabel' },
            { text: cabecera.usuario_ingre || 'N/A', style: 'value' },
            { text: 'Fecha creación:', style: 'badgeLabel' },
            {
              text: cabecera.fecha_ingre ? `${fDate(cabecera.fecha_ingre)} ${fTime(cabecera.hora_ingre)}` : 'N/A',
              style: 'value',
            },
          ],
        },
      ],
      margin: [0, 0, 0, 15] as [number, number, number, number],
    },
  ];

  // Mensaje final
  const mensajeFinal: Content[] = [
    {
      text: 'Este documento es un comprobante de movimiento de inventario válido según las normativas internas de la empresa.',
      style: 'footerText',
      margin: [0, 20, 0, 0] as [number, number, number, number],
      italics: true,
    },
  ];

  return {
    styles,
    pageMargins: [40, 20, 40, 20] as [number, number, number, number],
    footer: footerSection,
    content: [
      header,
      comprobanteInfo,
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 5,
            x2: 515,
            y2: 5,
            lineWidth: 1,
            lineColor: '#e2e8f0',
          },
        ],
        margin: [0, 0, 0, 0] as [number, number, number, number],
      },
      ...infoClienteProveedor,
      ...detallesContent,
      ...infoAdicionalContent,
      ...mensajeFinal,
    ],
  };
};
