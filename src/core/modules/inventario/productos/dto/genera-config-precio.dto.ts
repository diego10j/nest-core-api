import { IsDateString, IsInt } from 'class-validator';


export class GeneraConfigPreciosVentaDto {

    @IsInt()
    ide_inarti: number;

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

}
