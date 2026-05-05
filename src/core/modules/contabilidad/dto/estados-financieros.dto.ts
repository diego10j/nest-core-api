import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class EstadosFinancierosDto extends QueryOptionsDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    nivelPlan?: number;
}