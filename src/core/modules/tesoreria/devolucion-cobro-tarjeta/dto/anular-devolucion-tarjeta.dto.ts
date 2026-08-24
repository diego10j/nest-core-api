import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Motivo opcional de anulación de un ciclo de Devolución de Cobros con Tarjeta. */
export class AnularDevolucionTarjetaDto {
    @IsString()
    @IsOptional()
    @MaxLength(300)
    motivo?: string;
}
