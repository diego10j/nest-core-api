import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class SimuladorCuentaTarjetaDto {
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    @IsNumber()
    @Min(0)
    baseImponible: number;

    @IsNumber()
    @Min(0)
    valorIva: number;

    @IsNumber()
    @Min(0)
    total: number;

    @IsBoolean()
    @IsOptional()
    diferido?: boolean;
}
