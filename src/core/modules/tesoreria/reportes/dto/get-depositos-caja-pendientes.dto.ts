import { IsNumber, IsDateString } from 'class-validator';

export class GetDepositosCajaPendientesDto {

    @IsNumber()
    ideTecba: number;

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;
}
