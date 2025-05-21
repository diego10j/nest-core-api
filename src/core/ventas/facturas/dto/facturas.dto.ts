import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class FacturasDto extends QueryOptionsDto {

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_ccdaf?: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_sresc?: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_ccefa?: number;
}
