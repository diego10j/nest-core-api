import { Content } from 'pdfmake/interfaces';

export const footerSection = (
  currentPage: number,
  pageCount: number,
  showLeyenda: boolean = true
): Content => {
  const leyenda: Content = showLeyenda
    ? {
      text: [
        'Documento generado por el sistema ',
        { text: 'ProERP', bold: true },
        '. La información contenida es confidencial y para uso exclusivo de la empresa.'
      ],
      alignment: 'left',
      fontSize: 8,
      color: '#718096',
      margin: [10, 2, 0, 0],
    }
    : { text: '' };

  return {
    columns: [
      {
        stack: [leyenda],
        alignment: 'left',
        width: '*',
      },
      {
        text: `Página ${currentPage} de ${pageCount}`,
        alignment: 'right',
        fontSize: 9,
        margin: [0, 10, 35, 0],
        width: 'auto',
      },
    ],
    margin: [0, 0, 0, 10],
  };
};
