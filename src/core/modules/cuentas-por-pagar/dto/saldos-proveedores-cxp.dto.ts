import { IsDateString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class SaldosProveedoresCxPDto extends QueryOptionsDto {
    /** Fecha de corte para calcular los saldos (YYYY-MM-DD) */
    @IsDateString()
    fechaCorte: string;
}
