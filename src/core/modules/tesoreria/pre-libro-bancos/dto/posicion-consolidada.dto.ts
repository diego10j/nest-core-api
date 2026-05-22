import { IsOptional, IsNumber, IsDateString } from 'class-validator';

export class GetPosicionConsolidadaDto {

    @IsNumber()
    @IsOptional()
    ideTecba?: number;

    @IsDateString()
    @IsOptional()
    fechaFin?: string;
}
