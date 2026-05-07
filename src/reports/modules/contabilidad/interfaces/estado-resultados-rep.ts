import { CuentaContable, TotalPorTipo } from './balance-general-rep';

export interface EstadoResultadosData {
  cuentas: CuentaContable[];
  totalesPorTipo: TotalPorTipo[];
  totalIngresos: number;
  totalCostos: number;
  totalGastos: number;
  utilidadNeta: number;
  fechaInicio: string;
  fechaFin: string;
}
