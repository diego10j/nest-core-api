import { IsDateString, IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class KpiVentasProductoDto extends QueryOptionsDto {
    @IsInt()
    ide_inarti: number;

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;
}
