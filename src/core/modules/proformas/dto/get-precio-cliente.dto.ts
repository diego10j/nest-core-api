import { IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetPrecioClienteDto extends QueryOptionsDto {
    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsNumber()
    @IsOptional()
    @Min(0)
    cantidad?: number;

    @IsInt()
    @IsOptional()
    ide_geper?: number;

    @IsInt()
    @IsOptional()
    ide_cndfp?: number;
}
