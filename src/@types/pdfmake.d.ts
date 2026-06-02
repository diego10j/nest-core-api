/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Declaraciones de tipos para pdfmake@0.2.x
 * pdfmake 0.2.x no incluye declaraciones TypeScript en el paquete npm.
 */

declare module 'pdfmake/interfaces' {
    export type Content = any;
    export type TableCell = any;
    export type TDocumentDefinitions = any;
    export type StyleDictionary = Record<string, any>;
    export type ContentTable = any;
    export type CustomTableLayout = any;
    export type BufferOptions = any;
    export type TFontDictionary = Record<string, any>;
    export type TFontFamilyTypes = any;
    export type Margins = any;
    export type PageSize = any;
    export type DynamicLayout = any;
    export type ContentStack = any;
    export type ContentColumns = any;
    export type ContentImage = any;
    export type ContentSvg = any;
    export type ContentText = any;
}

declare module 'pdfmake' {
    import { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

    class PdfPrinter {
        constructor(fontDescriptors: TFontDictionary);
        createPdfKitDocument(docDefinition: TDocumentDefinitions, options?: any): any;
    }

    export default PdfPrinter;
}
