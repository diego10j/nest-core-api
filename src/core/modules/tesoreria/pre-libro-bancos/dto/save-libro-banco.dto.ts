import { IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';

export class SaveLibroBancoDto {

    @IsString()
    @IsOptional()
    beneficiario?: string;

    @IsDateString()
    fecha: string;

    @IsNumber()
    ideTettb: number;

    @IsNumber()
    ideTecba: number;

    @IsNumber()
    valor: number;

    @IsString()
    @IsOptional()
    observacion?: string;

    @IsString()
    @IsOptional()
    numero?: string;

    @IsDateString()
    @IsOptional()
    fechaEfectivo?: string;

    @IsString()
    @IsOptional()
    numCuentaCheque?: string;

    @IsNumber()
    @IsOptional()
    ideTeban?: number;
}
