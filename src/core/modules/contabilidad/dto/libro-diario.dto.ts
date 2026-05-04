import { IsDateString } from 'class-validator';

export class LibroDiarioDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;
}
