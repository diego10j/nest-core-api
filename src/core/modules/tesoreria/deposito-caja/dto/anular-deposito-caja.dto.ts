import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Motivo opcional de anulación de un Depósito de Caja. */
export class AnularDepositoCajaDto {
    @IsString()
    @IsOptional()
    @MaxLength(300)
    motivo?: string;
}
