import { IsInt, Max, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ReporteVentasMensualesDto extends QueryOptionsDto {
  /** Año del período (ej. 2026) */
  @IsInt()
  @Min(2000)
  periodo: number;

  /** Mes 1-12 */
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;
}

/** Fila común de facturas / notas de crédito del Reporte de Ventas Mensuales (IVA en Ventas) */
export type VentaMensualRow = {
  ide: number;
  fecha: string;
  numero: string;
  nom_geper: string;
  identificac_geper: string;
  ventas12: number;
  ventas0: number;
  valor_iva: number;
  total: number;
  observacion: string | null;
};

export type ReporteVentasMensualesResult = {
  facturas: VentaMensualRow[];
  notasCredito: VentaMensualRow[];
};
