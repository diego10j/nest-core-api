import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class FechaCorteDto extends QueryOptionsDto {
    /** Fecha de corte para calcular pagos vencidos (YYYY-MM-DD) */
    @IsDateString()
    fechaCorte: string;

    /** Días de anticipación para incluir alertas de próximo vencimiento (default: 7) */
    @IsInt()
    @Min(0)
    @IsOptional()
    diasAlerta?: number = 7;
}
