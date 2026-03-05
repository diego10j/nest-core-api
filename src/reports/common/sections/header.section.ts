import { Content } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { fDate } from 'src/util/helpers/date-util';
import { getStaticImage } from 'src/util/helpers/file-utils';

import { HeaderOptions } from '../interfaces/reportes';

// Constantes de diseño
const DEFAULT_MARGIN: [number, number, number, number] = [0, 0, 0, 15];
const COMPANY_TEXT_STYLE = {
  fontSize: 9,
  color: '#718096',
  margin: [0, 0, 0, 1] as [number, number, number, number],
};

export class HeaderSection {
  static createHeader(empresa: Empresa, options: HeaderOptions): Content {
    const { title, subTitle, showLogo = true, showDate = false } = options;

    const logoSection = this.createLogoSection(showLogo, empresa);
    const dateSection = this.createDateSection(showDate);
    const companyInfoSection = this.createCompanyInfoSection(empresa);
    const titleSection = this.createTitleSection(title, subTitle);

    return this.buildHeaderLayout(logoSection, companyInfoSection, dateSection, titleSection);
  }

  /**
   * Crea un header completo para reportes con título integrado.
   * El título se renderiza UNA SOLA VEZ mediante createReportTitleSection.
   * Se excluye de createHeader para evitar duplicados.
   */
  static createReportHeader(empresa: Empresa, options: HeaderOptions): Content {
    // Extraemos title y subTitle para que createHeader NO los pase a createTitleSection
    const { title, subTitle, ...headerOptions } = options;

    // createHeader recibe opciones sin title → createTitleSection retorna null → sin duplicado
    const header = this.createHeader(empresa, headerOptions);

    return {
      stack: [
        header,
        this.createReportTitleSection(title),
      ],
    };
  }

  private static createLogoSection(showLogo: boolean, empresa: Empresa): Content | null {
    if (!showLogo) return null;

    const logoPath = getStaticImage(empresa?.logotipo_empr || 'no-image');

    return {
      image: logoPath,
      height: 60,
      width: 120,
      margin: DEFAULT_MARGIN,
    };
  }

  private static createDateSection(showDate: boolean): Content | null {
    if (!showDate) return null;

    return {
      text: fDate(new Date()),
      alignment: 'right' as const,
      fontSize: 9,
      color: '#718096',
      margin: [0, 0, 0, 5] as [number, number, number, number],
    };
  }

  private static createCompanyInfoSection(empresa: Empresa): Content {
    const companyInfoStack: Content[] = [
      {
        text: empresa.nom_empr,
        style: {
          fontSize: 16,
          bold: true,
          color: '#2d3748',
          margin: [0, 0, 0, 2] as [number, number, number, number],
        },
      },
    ];

    if (empresa.direccion_empr) {
      const direccionCompleta = [empresa.direccion_empr].filter(Boolean).join(', ');
      companyInfoStack.push({
        text: direccionCompleta,
        style: COMPANY_TEXT_STYLE,
      });
    }

    if (empresa.identificacion_empr) {
      companyInfoStack.push({
        text: `RUC: ${empresa.identificacion_empr}`,
        style: COMPANY_TEXT_STYLE,
      });
    }

    return {
      stack: companyInfoStack,
      alignment: 'right' as const,
    };
  }

  private static createTitleSection(title?: string, subTitle?: string): Content | null {
    if (!title) return null;

    const titleStack: Content[] = [
      {
        text: title,
        alignment: 'center' as const,
        style: {
          bold: true,
          fontSize: 18,
          color: '#2d3748',
          margin: [0, 15, 0, 5] as [number, number, number, number],
        },
      },
    ];

    if (subTitle) {
      titleStack.push({
        text: subTitle,
        alignment: 'center' as const,
        style: {
          fontSize: 14,
          color: '#718096',
          margin: [0, 0, 0, 10] as [number, number, number, number],
        },
      });
    }

    return {
      stack: titleStack,
      margin: [0, 0, 0, 15] as [number, number, number, number],
    };
  }

  private static createReportTitleSection(reportTitle: string): Content {
    return {
      text: reportTitle,
      style: {
        fontSize: 16,
        bold: true,
        color: '#2d3748',
        alignment: 'center' as const,
        margin: [0, 10, 0, 15] as [number, number, number, number],
      },
    };
  }

  private static buildHeaderLayout(
    logo: Content | null,
    companyInfo: Content,
    date: Content | null,
    title: Content | null,
  ): Content {
    const headerColumns: Content[] = [];

    if (logo) {
      headerColumns.push({
        width: 120,
        stack: [logo],
        alignment: 'left' as const,
      });
    }

    const companyStack: Content[] = [companyInfo];
    if (date) {
      companyStack.push(date);
    }

    headerColumns.push({
      stack: companyStack,
      alignment: 'right' as const,
    });

    const headerContent: Content[] = [
      {
        columns: headerColumns,
        margin: [0, 0, 0, 0] as [number, number, number, number],
      },
    ];

    if (title) {
      headerContent.push(title);
    }

    return {
      stack: headerContent,
    };
  }
}