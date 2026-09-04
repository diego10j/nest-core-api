import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Listado paginado de notas de crédito de venta, filtrable por rango de fechas y estado SRI. */
export class GetNotasCreditoDto extends QueryOptionsDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    /** Estado SRI (sri_estado_comprobante.ide_sresc); 0 = notas anuladas (ide_cpeno=0), igual que facturas. */
    @IsInt()
    @IsOptional()
    ide_sresc?: number;
}
