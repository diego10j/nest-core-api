import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class LibroMayorDto {
    @IsInt()
    @IsNotEmpty()
    @Type(() => Number)
    ideCndpc: number; // ID de la cuenta del plan de cuentas

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;
}
