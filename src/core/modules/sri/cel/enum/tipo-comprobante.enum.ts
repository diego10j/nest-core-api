import { TipoComprobanteData } from "../types/types";

export class TipoComprobanteEnum {
    private static readonly data: Record<string, TipoComprobanteData> = {
        LOTE: { codigo: "00", descripcion: "LOTE MASIVO" },
        FACTURA: { codigo: "01", descripcion: "FACTURA" },
        NOTA_DE_CREDITO: { codigo: "04", descripcion: "NOTA DE CREDITO" },
        NOTA_DE_DEBITO: { codigo: "05", descripcion: "NOTA DE DEBITO" },
        GUIA_DE_REMISION: { codigo: "06", descripcion: "GUIA DE REMISION" },
        COMPROBANTE_DE_RETENCION: { codigo: "07", descripcion: "COMPROBANTE DE RETENCION" },
        LIQUIDACION_DE_COMPRAS: { codigo: "03", descripcion: "LIQ.DE COMPRAS" },
    };

    static getCodigo(descripcion: string): string | null {
        const entry = Object.values(TipoComprobanteEnum.data).find(
            (item) => item.descripcion === descripcion
        );
        return entry ? entry.codigo : null;
    }

    static getDescripcion(codigo: string): string | null {
        const entry = Object.values(TipoComprobanteEnum.data).find(
            (item) => item.codigo === codigo
        );
        return entry ? entry.descripcion : null;
    }

    static get LOTE(): TipoComprobanteData {
        return TipoComprobanteEnum.data.LOTE;
    }

    static get FACTURA(): TipoComprobanteData {
        return TipoComprobanteEnum.data.FACTURA;
    }

    static get NOTA_DE_CREDITO(): TipoComprobanteData {
        return TipoComprobanteEnum.data.NOTA_DE_CREDITO;
    }

    static get NOTA_DE_DEBITO(): TipoComprobanteData {
        return TipoComprobanteEnum.data.NOTA_DE_DEBITO;
    }

    static get GUIA_DE_REMISION(): TipoComprobanteData {
        return TipoComprobanteEnum.data.GUIA_DE_REMISION;
    }

    static get COMPROBANTE_DE_RETENCION(): TipoComprobanteData {
        return TipoComprobanteEnum.data.COMPROBANTE_DE_RETENCION;
    }

    static get LIQUIDACION_DE_COMPRAS(): TipoComprobanteData {
        return TipoComprobanteEnum.data.LIQUIDACION_DE_COMPRAS;
    }
}
