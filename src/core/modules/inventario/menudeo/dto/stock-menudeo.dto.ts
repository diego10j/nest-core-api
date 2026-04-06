import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class StockMenudeoDto extends QueryOptionsDto {
    /** Fecha de corte para calcular el stock (por defecto: fecha actual) */
    @IsOptional()
    @IsDateString()
    fechaCorte?: string;

    /** Bodega para filtrar los movimientos (opcional) */
    @IsOptional()
    @IsInt()
    ide_inbod?: number;
}
