import { IsDateString, IsInt, IsPositive } from 'class-validator';


export class GeneraConfigPreciosVentaDto {

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

}
