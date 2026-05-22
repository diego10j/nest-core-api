import { IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';

export class SaveDepositoCajaDto {

    @IsDateString()
    fecha: string;

    @IsNumber()
    ideTettb: number;

    @IsNumber()
    ideTecbaOrigen: number;

    @IsNumber()
    ideTecbaDestino: number;

    @IsNumber()
    valor: number;

    @IsString()
    @IsOptional()
    observacion?: string;

    @IsString()
    @IsOptional()
    numero?: string;
}
