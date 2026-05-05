import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

export class PeriodoAnioDto {
    @IsInt()
    @Min(2000)
    @Max(2100)
    @Type(() => Number)
    anio: number;
}

export class TopCuentasBiDto extends RangoFechasDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    limit?: number = 10;
}

export class ComparativoPeriodosDto {
    @IsInt()
    @Min(2000)
    @Max(2100)
    @Type(() => Number)
    anioActual: number;

    @IsInt()
    @Min(2000)
    @Max(2100)
    @Type(() => Number)
    anioAnterior: number;
}
