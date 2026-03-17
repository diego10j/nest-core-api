import { Content, TableCell } from 'pdfmake/interfaces';
import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { fDate } from 'src/util/helpers/date-util';
import { getStaticImage } from 'src/util/helpers/file-utils';
import { HeaderOptions } from '../interfaces/reportes';

// ─── Design tokens ─────────────────────────────────────────────────────────
const COLOR = {
  ink: '#111827',   // gray-900 — texto principal
  body: '#374151',   // gray-700 — texto secundario
  muted: '#6B7280',   // gray-500 — etiquetas y subtítulos
  hint: '#9CA3AF',   // gray-400 — detalles muy tenues
  accent: '#4B5563',   // gray-600 — acento de línea
  surface: '#F9FAFB',   // gray-50  — fondo del logo
  border: '#E5E7EB',   // gray-200 — líneas separadoras
  logoBorder: '#D1D5DB',// gray-300 — borde del contenedor de logo
  rule: '#e5e7eb',
};

const FONT = { base: 'Inter' };

// Logo 563×443 → ratio ≈ 1.272 — renderizado a 64 pt de alto
const LOGO = { width: 81, height: 64 };

// ─── HeaderSection ──────────────────────────────────────────────────────────
export class HeaderSection {

  /** Cabecera completa + bloque de título (una sola llamada). */
  static createReportHeader(empresa: Empresa, options: HeaderOptions): Content {
    return {
      stack: [
        this.buildTopStrip(empresa, options),
        this.buildDivider(),
        ...(options.title ? [this.buildTitleBlock(options.title, options.subTitle)] : []),
      ],
      margin: [0, 0, 0, 10] as [number, number, number, number],
    };
  }

  // ── Franja superior: logo | info empresa | fecha ────────────────────────
  private static buildTopStrip(empresa: Empresa, options: HeaderOptions): Content {
    const { showLogo = true, showDate = false } = options;  // ← false por defecto

    // columna de fecha: solo se agrega si showDate es true
    const dateWidth = showDate ? 84 : 0;

    const cells: TableCell[] = [];
    const widths: (string | number)[] = [];

    if (showLogo) {
      cells.push(this.buildLogoCell(empresa));
      widths.push(LOGO.width + 16);
    }

    cells.push(this.buildCompanyInfoCell(empresa));
    widths.push('*');

    if (showDate) {
      cells.push(this.buildDateCell());
      widths.push(84);
    }

    return {
      table: { widths, body: [cells] },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 18, 12, 0] as [number, number, number, number],
    };
  }

  // Logo enmarcado con fondo y borde redondeado
  private static buildLogoCell(empresa: Empresa): TableCell {
    const logoPath = getStaticImage(empresa?.logotipo_empr || 'no-image');

    return {
      // Tabla 1×1 actúa como el marco del logo
      table: {
        widths: [LOGO.width],
        heights: [LOGO.height],
        body: [[
          {
            image: logoPath,
            width: LOGO.width,
            height: LOGO.height,
            alignment: 'center' as const,
            margin: [0, 0, 0, 0] as [number, number, number, number],
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => COLOR.logoBorder,
        vLineColor: () => COLOR.logoBorder,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 4,
        paddingBottom: () => 4,
        fillColor: () => COLOR.surface,
      },
      margin: [0, 0, 16, 14] as [number, number, number, number],
    };
  }
  // Información de la empresa
  private static buildCompanyInfoCell(empresa: Empresa): TableCell {
    const lines: Content[] = [
      {
        text: empresa.nom_empr,
        font: FONT.base,
        fontSize: 16,
        bold: true,
        color: COLOR.ink,
        margin: [0, 2, 0, 5] as [number, number, number, number],
      },
    ];

    if (empresa.direccion_empr) {
      lines.push({
        text: empresa.direccion_empr,
        fontSize: 9,
        color: COLOR.muted,
        margin: [0, 0, 0, 2] as [number, number, number, number],
      });
    }

    if (empresa.identificacion_empr) {
      lines.push({
        text: `RUC  ${empresa.identificacion_empr}`,
        fontSize: 9,
        color: COLOR.muted,
        margin: [0, 0, 0, 0] as [number, number, number, number],
      });
    }

    if (empresa.pagina_empr) {
      lines.push({
        text: `${empresa.pagina_empr}`,
        fontSize: 9,
        color: COLOR.muted,
        margin: [0, 0, 0, 0] as [number, number, number, number],
      });
    }

    return {
      stack: lines,
      margin: [0, 0, 0, 14] as [number, number, number, number],
    };
  }

  // Fecha de generación
  private static buildDateCell(): TableCell {
    return {
      stack: [
        {
          text: 'GENERADO',
          fontSize: 7,
          color: COLOR.hint,
          bold: false,
          characterSpacing: 1.4,
          margin: [0, 4, 0, 4] as [number, number, number, number],
        },
        {
          text: fDate(new Date()),
          fontSize: 11,
          bold: true,
          color: COLOR.ink,
        },
      ],
      alignment: 'right' as const,
      margin: [0, 0, 0, 14] as [number, number, number, number],
    };
  }

  // ── Línea divisora con segmento de acento ──────────────────────────────
  private static buildDivider(): Content {
    // A4 (595pt) − margen izq (38) − margen der (38) = 519
    return {
      canvas: [
        {
          type: 'line',
          x1: 0, y1: 0,
          x2: 519, y2: 0,
          lineWidth: 0.75,
          lineColor: COLOR.rule,
        },
      ],
      margin: [0, 0, 0, 12] as [number, number, number, number],
    };
  }

  // ── Bloque de título ───────────────────────────────────────────────────
  private static buildTitleBlock(title: string, subTitle?: string): Content {
    const stack: Content[] = [
      {
        text: title,
        fontSize: 15,
        bold: true,
        color: COLOR.ink,
        margin: [0, 0, 0, subTitle ? 4 : 0] as [number, number, number, number],
      },
    ];

    if (subTitle) {
      stack.push({
        text: subTitle,
        fontSize: 10,
        color: COLOR.muted,
      });
    }

    return {
      stack,
      alignment: 'left' as const,
      margin: [12, 12, 12, 16] as [number, number, number, number],
    };
  }

  // ── Separador entre secciones del reporte ──────────────────────────────
  static createSectionDivider(): Content {
    return {
      canvas: [{
        type: 'line',
        x1: 0, y1: 0,
        x2: 519, y2: 0,   // ← mismo valor
        lineWidth: 0.5,
        lineColor: COLOR.border,
      }],
      margin: [0, 0, 0, 14] as [number, number, number, number],
    };
  }

  // ── Shim de compatibilidad ─────────────────────────────────────────────
  /** @deprecated Usa createReportHeader. */
  static createHeader(empresa: Empresa, options: HeaderOptions): Content {
    return this.createReportHeader(empresa, options);
  }
}