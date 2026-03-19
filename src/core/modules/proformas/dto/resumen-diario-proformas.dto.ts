import { IsDateString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ResumenDiarioProformasDto extends QueryOptionsDto {
    /** Fecha del día a analizar (YYYY-MM-DD) */
    @IsDateString()
    fecha: string;
}
