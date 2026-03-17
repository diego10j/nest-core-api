import * as path from 'path';
import * as fs from 'fs';

import { Injectable } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import { BufferOptions, CustomTableLayout, TDocumentDefinitions } from 'pdfmake/interfaces';

const INTER_FONT_SOURCES = [
  {
    url: 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf',
    name: 'Inter-Regular.ttf',
  },
  {
    url: 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Medium.ttf',
    name: 'Inter-Medium.ttf',
  },
  {
    url: 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf',
    name: 'Inter-Bold.ttf',
  },
];

const REQUIRED_INTER_LOCAL_FILES = [
  'Inter-Regular.ttf',
  'Inter-Medium.ttf',
  'Inter-Bold.ttf',
  'Inter-Italic-Variable.ttf',
];

const fontsDir = path.join(process.cwd(), 'public/assets/fonts');

const fonts = {
  Roboto: {
    normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
    bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
    italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
  },
  Inter: {
    normal: path.join(fontsDir, 'Inter-Regular.ttf'),
    bold: path.join(fontsDir, 'Inter-Bold.ttf'),
    // pdfmake exige variantes italic y bolditalic en la familia.
    italics: path.join(fontsDir, 'Inter-Italic-Variable.ttf'),
    bolditalics: path.join(fontsDir, 'Inter-Italic-Variable.ttf'),
  },
};

const customTableLayouts: Record<string, CustomTableLayout> = {
  customLayout01: {
    hLineWidth: function (i, node) {
      if (i === 0 || i === node.table.body.length) {
        return 0;
      }
      return i === node.table.headerRows ? 2 : 1;
    },
    vLineWidth: function () {
      return 0;
    },
    hLineColor: function (i) {
      return i === 1 ? 'black' : '#bbbbbb';
    },
    paddingLeft: function (i) {
      return i === 0 ? 0 : 8;
    },
    paddingRight: function (i, node) {
      return i === node.table.widths.length - 1 ? 0 : 8;
    },
    fillColor: function (i, node) {
      if (i === 0) {
        return '#7b90be';
      }
      if (i === node.table.body.length - 1) {
        return '#acb3c1';
      }

      return i % 2 === 0 ? '#f3f3f3' : null;
    },
  },
};

@Injectable()
export class PrinterService {
  private printer = new PdfPrinter(fonts);

  constructor() {
    const missingInterFonts = REQUIRED_INTER_LOCAL_FILES.filter(
      (fontName) => !fs.existsSync(path.join(fontsDir, fontName)),
    );

    if (missingInterFonts.length > 0) {
      const sourceList = INTER_FONT_SOURCES
        .map((font) => `${font.name}: ${font.url}`)
        .join(' | ');
      console.warn(`[PrinterService] Faltan fuentes Inter locales. Descargue: ${sourceList}`);
    }
  }

  createPdf(
    docDefinition: TDocumentDefinitions,
    options: BufferOptions = {
      tableLayouts: customTableLayouts,
    },
  ): PDFKit.PDFDocument {
    return this.printer.createPdfKitDocument(docDefinition, options);
  }
}
