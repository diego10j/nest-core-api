import { Content } from 'pdfmake/interfaces';
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

  // ── Franja superior: logo | info empresa | usuario/fecha ─────────────────
  // Se arma con `columns` (no `table`): un `table` de pdfmake puede terminar
  // dibujando líneas de celda por defecto en algunos visores/combinaciones aunque
  // el `layout` las ponga en 0 — `columns` es un layout puro, sin ninguna semántica
  // de borde posible, así que es la forma más segura de garantizar "sin líneas".
  private static buildTopStrip(empresa: Empresa, options: HeaderOptions): Content {
    const { showLogo = true, showDate = false, usuario } = options; // ← showDate false por defecto

    const columns: Content[] = [];

    if (showLogo) {
      columns.push({ width: LOGO.width + 16, ...this.buildLogoCell(empresa) });
    }

    columns.push({ width: '*', ...this.buildCompanyInfoCell(empresa) });

    if (showDate) {
      columns.push({ width: 130, ...this.buildMetaCell(usuario) });
    }

    return {
      columns,
      margin: [0, 18, 12, 0] as [number, number, number, number],
    };
  }

  // Logo enmarcado con fondo y borde redondeado
  private static buildLogoCell(empresa: Empresa): Content {
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
  private static buildCompanyInfoCell(empresa: Empresa): Content {
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

  // Usuario que generó el reporte (opcional) + fecha de impresión
  private static buildMetaCell(usuario?: string): Content {
    const stack: Content[] = [];

    if (usuario) {
      stack.push(
        {
          text: 'USUARIO',
          fontSize: 7,
          color: COLOR.hint,
          characterSpacing: 1.4,
          margin: [0, 4, 0, 2] as [number, number, number, number],
        },
        {
          text: usuario,
          fontSize: 10,
          bold: true,
          color: COLOR.ink,
          margin: [0, 0, 0, 8] as [number, number, number, number],
        },
      );
    }

    stack.push(
      {
        text: 'FECHA DE IMPRESIÓN',
        fontSize: 7,
        color: COLOR.hint,
        characterSpacing: 1.4,
        margin: [0, usuario ? 0 : 4, 0, 2] as [number, number, number, number],
      },
      {
        text: fDate(new Date()),
        fontSize: 10,
        bold: true,
        color: COLOR.ink,
      },
    );

    return {
      stack,
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