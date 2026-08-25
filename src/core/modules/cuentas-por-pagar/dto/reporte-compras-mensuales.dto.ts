import { IsInt, Max, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ReporteComprasMensualesDto extends QueryOptionsDto {
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

/** Fila común de facturas / notas de crédito del Reporte de Compras Mensuales (IVA en Compras) */
export type CompraMensualRow = {
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

export type ReporteComprasMensualesResult = {
    facturas: CompraMensualRow[];
    notasCredito: CompraMensualRow[];
};
