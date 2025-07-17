import { EstadoComprobanteData } from "../types/types";

export class EstadoComprobanteEnum {
    private static readonly data: Record<string, EstadoComprobanteData> = {
        RECIBIDA: { codigo: 1, descripcion: "RECIBIDA" },
        DEVUELTA: { codigo: 2, descripcion: "DEVUELTA" },
        AUTORIZADO: { codigo: 3, descripcion: "AUTORIZADO" },
        RECHAZADO: { codigo: 4, descripcion: "RECHAZADO" },
        NOAUTORIZADO: { codigo: 6, descripcion: "NO AUTORIZADO" },
        PENDIENTE: { codigo: 5, descripcion: "PENDIENTE" },
        ENPROCESO: { codigo: 1, descripcion: "EN PROCESO" }, // Similar a Recibida
        ANULADO: { codigo: 0, descripcion: "ANULADO" },
    };

    static getCodigo(descripcion: string): number | null {
        const entry = Object.values(EstadoComprobanteEnum.data).find(
            (item) => item.descripcion === descripcion
        );
        return entry ? entry.codigo : null;
    }

    static getDescripcion(codigo: number): string | null {
        const entry = Object.values(EstadoComprobanteEnum.data).find(
            (item) => item.codigo === codigo
        );
        return entry ? entry.descripcion : null;
    }

    static get RECIBIDA(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.RECIBIDA;
    }

    static get DEVUELTA(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.DEVUELTA;
    }

    static get AUTORIZADO(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.AUTORIZADO;
    }

    static get RECHAZADO(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.RECHAZADO;
    }

    static get NOAUTORIZADO(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.NOAUTORIZADO;
    }

    static get PENDIENTE(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.PENDIENTE;
    }

    static get ENPROCESO(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.ENPROCESO;
    }

    static get ANULADO(): EstadoComprobanteData {
        return EstadoComprobanteEnum.data.ANULADO;
    }
}
