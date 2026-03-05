import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ResumenDiarioFacturasDto extends QueryOptionsDto {
    /** Fecha del día a analizar (YYYY-MM-DD) */
    @IsDateString()
    fecha: string;

    /** Filtrar por punto de emisión (opcional) */
    @IsInt()
    @IsOptional()
    ide_ccdaf?: number;
}
