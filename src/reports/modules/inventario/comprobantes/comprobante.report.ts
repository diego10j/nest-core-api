import path from 'path';
import type { Content, StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import { footerSection } from 'src/reports/common/sections/footer.section';
import { fCurrency } from 'src/util/helpers/common-util';
import { fDate, fTime } from 'src/util/helpers/date-util';
import { ComprobanteInvRep } from './comprobantes-types';

const styles: StyleDictionary = {
  header: {
    fontSize: 18,
    bold: true,
    margin: [0, 0, 0, 4],
    color: '#2d3748'
  },
  subHeader: {
    fontSize: 14,
    bold: true,
    margin: [0, 6, 0, 3],
    color: '#4a5568'
  },
  sectionHeader: {
    fontSize: 12,
    bold: true,
    margin: [0, 12, 0, 6],
    color: '#2d3748'
  },
  label: {
    bold: true,
    fontSize: 9,
    color: '#718096',
    margin: [0, 2, 0, 0]
  },
  value: {
    fontSize: 10,
    margin: [0, 0, 0, 5],
    color: '#2d3748'
  },
  tableHeader: {
    bold: true,
    fontSize: 9,
    color: '#2d3748',
    fillColor: '#f7fafc',
    alignment: 'center'
  },
  positiveValue: {
    color: '#38a169',
    bold: true
  },
  negativeValue: {
    color: '#e53e3e',
    bold: true
  },
  totalRow: {
    bold: true,
    fontSize: 10,
    fillColor: '#f8f9fa',
    color: '#2d3748'
  },
  footerText: {
    fontSize: 8,
    color: '#a0aec0',
    alignment: 'center'
  },
  badge: {
    fontSize: 8,
    bold: true,
    color: 'white',
    alignment: 'center'
  },
  companyText: {
    fontSize: 9,
    color: '#718096',
    margin: [0, 0, 0, 1]
  },
  comprobanteNumber: {
    fontSize: 16,
    bold: true,
    color: '#e53e3e',
    margin: [0, 0, 0, 0]
  }
};

export const comprobanteInventarioReport = (comprobante: ComprobanteInvRep, header: Content): TDocumentDefinitions => {
  const { cabecera, detalles } = comprobante;

  // Determinar si es ingreso o egreso
  const isIngreso = cabecera.signo_intci === 1;
  const headerColor = isIngreso ? '#38a169' : '#e53e3e';

  // Crear sección de encabezado
  const sectionHeader = (text: string): Content => ({
    text,
    style: 'sectionHeader',
    margin: [0, 12, 0, 6] as [number, number, number, number]
  });

  // Crear badge de estado
  const statusBadge = (text: string, isVerified: boolean): Content => ({
    text,
    style: 'badge',
    margin: [0, 0, 0, 3] as [number, number, number, number],
    fillColor: isVerified ? '#38a169' : '#d69e2e'
  });

  // Título con número de comprobante en rojo
  const tituloComprobante: Content = {
    stack: [
      {
        columns: [
          {
            text: 'COMPROBANTE DE INVENTARIO',
            style: {
              fontSize: 16,
              bold: true,
              color: '#2d3748',
              margin: [0, 0, 0, 0] as [number, number, number, number]
            }
          },
          {
            text: `#${cabecera.numero_incci}`,
            style: 'comprobanteNumber',
            margin: [10, 0, 0, 0] as [number, number, number, number]
          }
        ],
        alignment: 'center' as const,
        margin: [0, 0, 0, 10] as [number, number, number, number]
      },
      {
        text: isIngreso ? `${cabecera.nombre_intti.toUpperCase()} (+)` : `${cabecera.nombre_intti.toUpperCase()} (-)`,
        style: {
          fontSize: 14,
          bold: true,
          color: headerColor,
          alignment: 'center' as const,
          margin: [0, 0, 0, 8] as [number, number, number, number]
        }
      }
    ]
  };

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
                style: { bold: true, fontSize: 10, color: '#718096', margin: [0, 0, 0, 2] as [number, number, number, number] }
              },
              {
                text: fDate(cabecera.fecha_trans_incci),
                style: { fontSize: 11, color: '#2d3748', margin: [0, 0, 0, 8] as [number, number, number, number] }
              },
              {
                text: 'Bodega:',
                style: { bold: true, fontSize: 10, color: '#718096', margin: [0, 0, 0, 2] as [number, number, number, number] }
              },
              {
                text: cabecera.nombre_inbod || 'N/A',
                style: { fontSize: 11, color: '#2d3748', margin: [0, 0, 0, 0] as [number, number, number, number] }
              }
            ]
          },
          // Columna derecha: Estados y badges
          {
            width: '40%',
            stack: [
              {
                text: 'Estados:',
                style: { bold: true, fontSize: 10, color: '#718096', margin: [0, 0, 0, 5] as [number, number, number, number] }
              },
              statusBadge(cabecera.verifica_incci ? '✓ VERIFICADO' : '⏳ PENDIENTE', cabecera.verifica_incci),
              { text: '', margin: [0, 3, 0, 0] as [number, number, number, number] },
              statusBadge(cabecera.automatico_incci ? '⚡ AUTOMÁTICO' : '👤 MANUAL', cabecera.automatico_incci),
              { text: '', margin: [0, 8, 0, 0] as [number, number, number, number] },
              {
                text: 'Usuario:',
                style: { bold: true, fontSize: 10, color: '#718096', margin: [0, 0, 0, 2] as [number, number, number, number] }
              },
              {
                text: cabecera.usuario_ingre || 'N/A',
                style: { fontSize: 10, color: '#2d3748' }
              }
            ],
            alignment: 'right' as const
          }
        ]
      }
    ],
    margin: [0, 0, 0, 15] as [number, number, number, number]
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
            { text: cabecera.nom_geper || 'N/A', style: { ...styles.value, margin: [0, 0, 0, 8] as [number, number, number, number] } },
            { text: 'Observaciones:', style: 'label' },
            { text: cabecera.observacion_incci || 'Ninguna', style: { ...styles.value } }
          ]
        },
        {
          width: '40%',
          stack: [
            { text: 'Tipo Movimiento:', style: 'label' },
            {
              text: cabecera.nombre_intti,
              style: { ...styles.value, color: headerColor, margin: [0, 0, 0, 8] as [number, number, number, number] }
            },
            { text: 'Proceso:', style: 'label' },
            { text: cabecera.nombre_inepi || 'N/A', style: styles.value }
          ]
        }
      ],
      margin: [0, 0, 0, 8] as [number, number, number, number]
    }
  ];

  // Observaciones
  const observacionesContent: Content[] = cabecera.observacion_incci ? [
    sectionHeader('OBSERVACIONES'),
    {
      text: cabecera.observacion_incci,
      style: { ...styles.value },
      margin: [0, 0, 0, 12] as [number, number, number, number],
    }
  ] : [];

  // Calcular totales
  const subtotal = detalles.reduce((sum, detalle) => sum + (detalle.precio_indci * detalle.cantidad_indci), 0);
  const total = subtotal;

  // Detalles de productos
  const detallesContent: Content[] = [
    sectionHeader('DETALLES DEL MOVIMIENTO'),
    {
      table: {
        headerRows: 1,
        widths: ['*', 60, 80, 80, 50],
        body: [
          [
            { text: 'Producto', style: 'tableHeader' },
            { text: 'Cantidad', style: 'tableHeader' },
            { text: 'Precio Unit.', style: 'tableHeader' },
            { text: 'Valor', style: 'tableHeader' },
            { text: '✓', style: 'tableHeader' }
          ],
          ...detalles.map(detalle => [
            { text: detalle.nombre_inarti, style: 'value' },
            { text: detalle.cantidad_indci.toString(), style: 'value', alignment: 'center' as const },
            { text: fCurrency(detalle.precio_indci), style: 'value', alignment: 'right' as const },
            { text: fCurrency(detalle.valor_indci || detalle.precio_indci * detalle.cantidad_indci), style: 'value', alignment: 'right' as const },
            {
              text: detalle.verifica_indci ? '✓' : '✗',
              style: detalle.verifica_indci ? 'positiveValue' : 'negativeValue',
              alignment: 'center' as const,
              fontSize: 10
            }
          ])
        ]
      },
      layout: {
        hLineWidth: (i: number) => i === 0 || i === detalles.length + 1 ? 0.7 : 0.3,
        vLineWidth: () => 0.3,
        hLineColor: (i: number) => i === 0 || i === 1 || i === detalles.length + 1 ? '#cbd5e0' : '#e2e8f0',
        vLineColor: () => '#e2e8f0',
        paddingTop: (i: number) => i === 0 ? 8 : 5,
        paddingBottom: (i: number) => i === detalles.length ? 8 : 5,
        paddingLeft: () => 5,
        paddingRight: () => 5
      }
    },
    // Totales
    {
      table: {
        widths: ['*', 80],
        body: [
          [
            { text: 'SUBTOTAL', style: 'totalRow' },
            { text: fCurrency(subtotal), style: 'totalRow', alignment: 'right' as const }
          ],
          [
            { text: 'TOTAL', style: { ...styles.totalRow, fontSize: 11, color: headerColor } },
            { text: fCurrency(total), style: { ...styles.totalRow, fontSize: 11, color: headerColor }, alignment: 'right' as const }
          ]
        ]
      },
      layout: 'noBorders',
      margin: [0, 10, 0, 0] as [number, number, number, number]
    }
  ];

  // Información adicional
  const infoAdicionalContent: Content[] = [
    sectionHeader('INFORMACIÓN ADICIONAL'),
    {
      columns: [
        {
          width: '50%',
          stack: [
            { text: 'Documento relacionado:', style: 'label' },
            { text: cabecera.ide_cnccc ? `Factura No. ${cabecera.ide_cnccc}` : 'N/A', style: 'value' },
            { text: 'Fecha creación:', style: 'label' },
            { text: cabecera.fecha_ingre ? `${fDate(cabecera.fecha_ingre)} ${fTime(cabecera.hora_ingre)}` : 'N/A', style: 'value' },
          ]
        },
        {
          width: '50%',
          stack: [
            ...(cabecera.verifica_incci ? [
              { text: 'Verificado por:', style: 'label' },
              { text: cabecera.usuario_verifica_incci || 'N/A', style: 'value' },
              { text: 'Fecha verificación:', style: 'label' },
              { text: fDate(cabecera.fecha_verifica_incci), style: 'value' }
            ] : [
              { text: 'Estado:', style: 'label' },
              { text: 'PENDIENTE DE VERIFICACIÓN', style: { ...styles.value, color: '#d69e2e' } }
            ])
          ]
        }
      ],
      margin: [0, 0, 0, 15] as [number, number, number, number]
    }
  ];

  // Mensaje final
  const mensajeFinal: Content[] = [{
    text: 'Este documento es un comprobante de movimiento de inventario válido según las normativas internas de la empresa.',
    style: 'footerText',
    margin: [0, 20, 0, 0] as [number, number, number, number],
    italics: true
  }];

  return {
    styles: styles,
    pageMargins: [40, 20, 40, 20],
    footer: footerSection,
    content: [
      header,
      comprobanteInfo,
      { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 5, 0, 12] as [number, number, number, number] },
      ...infoClienteProveedor,
      ...observacionesContent,
      ...detallesContent,
      ...infoAdicionalContent,
      ...mensajeFinal
    ],
  };
};