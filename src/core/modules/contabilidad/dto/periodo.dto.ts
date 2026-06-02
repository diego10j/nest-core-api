import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';

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
