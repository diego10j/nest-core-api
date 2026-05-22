import { IsNumber, IsString } from 'class-validator';

export class ReportePagosDto {

    @IsNumber()
    anio: number;

    @IsString()
    numeroMes: string;
}
