export interface CuentaContable {
  ide_cndpc: number;
  con_ide_cndpc: number | null;
  codig_recur_cndpc: string;
  nombre_cndpc: string;
  nivel: number;
  ide_cntcu: number;
  valor: number;
}

export interface TotalPorTipo {
  ide_cntcu: number;
  nombre_cntcu: string;
  total: number;
}

export interface BalanceGeneralData {
  cuentas: CuentaContable[];
  totalesPorTipo: TotalPorTipo[];
  fechaInicio: string;
  fechaFin: string;
}
