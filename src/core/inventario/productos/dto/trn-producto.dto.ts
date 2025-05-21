import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TrnProductoDto extends QueryOptionsDto {

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inbod?: number;

}
