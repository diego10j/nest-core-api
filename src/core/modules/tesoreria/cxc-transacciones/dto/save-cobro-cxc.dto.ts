import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SaveCobroCxCDto {
    @IsInt()
    @IsNotEmpty()
    ideCccfa: number;

    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    @IsInt()
    @IsNotEmpty()
    ideTettb: number;

    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;

    @IsString()
    @IsNotEmpty()
    observacion: string;

    @IsString()
    @IsOptional()
    numero?: string;

    @IsDateString()
    @IsOptional()
    fechaEfectivo?: string;

    @IsString()
    @IsOptional()
    numCuentaCheque?: string;

    @IsInt()
    @IsOptional()
    ideTeban?: number;
}
