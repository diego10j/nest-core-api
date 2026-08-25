export interface CuentaMayor {
  ide_cndpc: number;
  codig_recur_cndpc: string;
  nombre_cndpc: string;
}

export interface MovimientoMayor {
  ide_cnccc: number | null;
  fecha_trans_cnccc: string;
  numero_cnccc: string | null;
  beneficiario: string;
  ide_cnlap: number | null;
  debe: number;
  haber: number;
  observacion: string;
  saldo: number;
}

export interface TotalesMayor {
  debe: number;
  haber: number;
  saldo: number;
  saldoInicial: number;
}

export interface LibroMayorData {
  cuenta: CuentaMayor;
  movimientos: MovimientoMayor[];
  totales: TotalesMayor;
  fechaInicio: string;
  fechaFin: string;
}
