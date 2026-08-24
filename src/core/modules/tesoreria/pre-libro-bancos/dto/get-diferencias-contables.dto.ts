import { IsDateString, IsInt, IsOptional } from 'class-validator';

export class GetDiferenciasContablesDto {

    @IsInt()
    @IsOptional()
    ideTecba?: number;

    @IsDateString()
    @IsOptional()
    fechaInicio?: string;

    @IsDateString()
    @IsOptional()
    fechaFin?: string;
}
