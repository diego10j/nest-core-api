import { IsNumber, IsString } from 'class-validator';

export class ReporteCobrosDto {

    @IsNumber()
    anio: number;

    @IsString()
    numeroMes: string;
}
