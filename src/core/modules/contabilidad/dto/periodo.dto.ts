import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class PeriodoIdDto {
    @IsInt()
    @IsNotEmpty()
    @Type(() => Number)
    ideCnper: number;
}

export class PeriodoFechaDto {
    @IsDateString()
    fecha: string;
}
