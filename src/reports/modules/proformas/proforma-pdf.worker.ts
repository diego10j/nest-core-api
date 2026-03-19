/**
 * Worker piscina para generación de PDFs de proforma.
 *
 * piscina exige que el archivo exporte una función (default export o named export).
 * El worker se inicializa UNA vez y se reutiliza para múltiples peticiones,
 * por lo que PdfPrinter se construye una sola vez (fuentes en memoria).
 */
import * as path from 'path';

import PdfPrinter from 'pdfmake';

import { Empresa } from 'src/core/modules/sistema/admin/interfaces/empresa';
import { HeaderSection } from 'src/reports/common/sections/header.section';

import { ProformaRep } from './interfaces/proforma-rep';
import { proformaReport } from './proforma.report';

const fontsDir = path.join(process.cwd(), 'public/assets/fonts');

// Instancia única por worker — fuentes leídas una sola vez al arrancar el hilo.
const printer = new PdfPrinter({
    Roboto: {
        normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
        bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
        italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
    },
    Inter: {
        normal: path.join(fontsDir, 'Inter-Regular.ttf'),
        bold: path.join(fontsDir, 'Inter-Bold.ttf'),
        italics: path.join(fontsDir, 'Inter-Italic-Variable.ttf'),
        bolditalics: path.join(fontsDir, 'Inter-Italic-Variable.ttf'),
    },
});

/**
 * Función invocada por piscina para cada tarea.
 * Recibe datos serializables (ProformaRep + Empresa) y devuelve un Buffer.
 */
export default function generateProformaPdf(
    { proforma, empresa }: { proforma: ProformaRep; empresa: Empresa },
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const header = HeaderSection.createReportHeader(empresa, { showDate: false } as any);
        const docDefinition = proformaReport(proforma, header);

        const doc = printer.createPdfKitDocument(docDefinition);
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}
