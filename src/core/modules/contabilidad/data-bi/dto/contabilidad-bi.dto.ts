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

export class PeriodoContableDto {
    @IsInt()
    @Type(() => Number)
    ideCnper: number;
}

export class EvolucionPeriodosDto {
    @IsInt()
    @Min(1)
    @Max(60)
    @Type(() => Number)
    @IsOptional()
    cantidad?: number = 12;
}

export class AnioMesDto {
    @IsInt()
    @Min(2000)
    @Max(2100)
    @Type(() => Number)
    anio: number;

    @IsInt()
    @Min(1)
    @Max(12)
    @Type(() => Number)
    mes: number;
}
