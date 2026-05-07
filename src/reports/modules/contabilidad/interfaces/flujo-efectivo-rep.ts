export interface LineaFlujo {
    ide_cndpc: number;
    codig_recur_cndpc: string;
    descripcion: string;
    clasificacion_cnfcc: string;
    es_no_monetaria_cnfcc: boolean;
    variacion_periodo: number;
}

export interface CuentaEfectivo {
    ide_cndpc: number;
    nombre_tecba: string;
    saldo_inicio: number;
    saldo_fin: number;
}

export interface FlujoEfectivoData {
    utilidadEjercicio: number;
    ajustesNoMonetarios: LineaFlujo[];
    totalAjustes: number;
    capitalTrabajo: LineaFlujo[];
    totalCapitalTrabajo: number;
    flujoOperacional: number;
    flujosInversion: LineaFlujo[];
    flujoInversion: number;
    flujosFinanciamiento: LineaFlujo[];
    flujoFinanciamiento: number;
    variacionNetaEfectivo: number;
    efectivoInicio: number;
    efectivoFin: number;
    cuentasEfectivo: CuentaEfectivo[];
    fechaInicio: string;
    fechaFin: string;
}
