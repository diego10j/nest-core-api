import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class PreciosProductoDto extends QueryOptionsDto {

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsInt()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    cantidad?: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inbod?: number;
}
