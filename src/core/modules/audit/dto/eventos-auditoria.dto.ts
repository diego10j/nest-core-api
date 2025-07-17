import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';

export class EventosAuditoriaDto  {

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_usua?: number;
}