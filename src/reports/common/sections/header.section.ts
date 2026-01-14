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

/**
 * Clase de utilidad para crear headers - Solo diseño
 * No es un servicio de NestJS, solo funciones puras
 */
export class HeaderSection {
  /**
   * Crea el encabezado del documento
   */
  static createHeader(empresa: Empresa, options: HeaderOptions): Content {
    const { title, subTitle, showLogo = true, showDate = false } = options;

    // Crear secciones del header
    const logoSection = this.createLogoSection(showLogo, empresa);
    const dateSection = this.createDateSection(showDate);
    const companyInfoSection = this.createCompanyInfoSection(empresa);
    const titleSection = this.createTitleSection(title, subTitle);

    // Construir el layout del header
    return this.buildHeaderLayout(logoSection, companyInfoSection, dateSection, titleSection);
  }

  /**
   * Crea un header completo para reportes con título integrado
   */
  static createReportHeader(empresa: Empresa, options: HeaderOptions): Content {
    const { title, ...headerOptions } = options;

    const header = this.createHeader(empresa, headerOptions);

    return {
      stack: [header, this.createReportTitleSection(title)],
    };
  }

  /**
   * Crea la sección del logo
   */
  private static createLogoSection(showLogo: boolean, empresa: Empresa): Content | null {
    if (!showLogo) return null;

    const logoPath = getStaticImage(empresa?.logotipo_empr || 'no-image');

    return {
      image: logoPath,
      height: 50,
      width: 70,
      margin: DEFAULT_MARGIN,
    };
  }

  /**
   * Crea la sección de fecha
   */
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

  /**
   * Crea la sección de información de la empresa
   */
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

    // Dirección completa
    if (empresa.direccion_empr) {
      const direccionCompleta = [empresa.direccion_empr].filter(Boolean).join(', ');

      companyInfoStack.push({
        text: direccionCompleta,
        style: COMPANY_TEXT_STYLE,
      });
    }

    // RUC
    if (empresa.identificacion_empr) {
      companyInfoStack.push({
        text: `RUC: ${empresa.identificacion_empr}`,
        style: COMPANY_TEXT_STYLE,
      });
    }

    // Teléfono
    // if (empresa.telefono_empr) {
    //     companyInfoStack.push({
    //         text: `Tel: ${empresa.telefono_empr}`,
    //         style: COMPANY_TEXT_STYLE
    //     });
    // }

    // Página web
    // if (empresa.pagina_empr) {
    //     companyInfoStack.push({
    //         text: empresa.pagina_empr,
    //         style: COMPANY_TEXT_STYLE,
    //         link: empresa.pagina_empr.startsWith('http') ? empresa.pagina_empr : `https://${empresa.pagina_empr}`
    //     });
    // }

    return {
      stack: companyInfoStack,
      alignment: 'right' as const,
    };
  }

  /**
   * Crea la sección del título
   */
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

  /**
   * Crea la sección de título para reportes
   */
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

  /**
   * Construye el layout final del header
   */
  private static buildHeaderLayout(
    logo: Content | null,
    companyInfo: Content,
    date: Content | null,
    title: Content | null,
  ): Content {
    const headerColumns: Content[] = [];

    // Columna del logo (si existe)
    if (logo) {
      headerColumns.push({
        width: 120,
        stack: [logo],
        alignment: 'left' as const,
      });
    }

    // Columna de información de la empresa y fecha
    const companyStack: Content[] = [companyInfo];
    if (date) {
      companyStack.push(date);
    }

    headerColumns.push({
      // width: logo ? '*' : 'auto',
      stack: companyStack,
      alignment: 'right' as const,
    });

    const headerContent: Content[] = [
      {
        columns: headerColumns,
        margin: [0, 0, 0, 0] as [number, number, number, number],
      },
    ];

    // Agregar título si existe
    if (title) {
      headerContent.push(title);
    }

    return {
      stack: headerContent,
    };
  }
}
