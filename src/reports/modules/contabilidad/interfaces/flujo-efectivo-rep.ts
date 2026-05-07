export interface FlujoClasificado {
  ide_cnfcc: number;
  ide_cndpc: number;
  codig_recur_cndpc: string;
  descripcion: string;
  clasificacion_cnfcc: string;
  es_no_monetaria_cnfcc: boolean;
  orden_cnfcc: number;
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
  ajustesNoMonetarios: FlujoClasificado[];
  totalAjustes: number;
  capitalTrabajo: FlujoClasificado[];
  totalCapitalTrabajo: number;
  flujoOperacional: number;
  flujosInversion: FlujoClasificado[];
  flujoInversion: number;
  flujosFinanciamiento: FlujoClasificado[];
  flujoFinanciamiento: number;
  variacionNetaEfectivo: number;
  efectivoInicio: number;
  efectivoFin: number;
  cuentasEfectivo: CuentaEfectivo[];
  fechaInicio: string;
  fechaFin: string;
}
