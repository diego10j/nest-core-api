import { Type } from 'class-transformer';
import {
    IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

/**
 * Metadatos del comprobante (foto ya subida a temp_media vía uploadComprobante) a vincular
 * atómicamente con la transferencia. Se envían en la misma llamada que genera el asiento y los
 * movimientos de tesorería (no una llamada separada) para no dejar comprobantes huérfanos ni
 * movimientos sin comprobante si algo falla a mitad de camino.
 */
export class ComprobanteTransferenciaDto {
    @IsString()
    fotoFileName: string;

    @IsString()
    @IsOptional()
    ordenante?: string;

    @IsString()
    @IsOptional()
    cuentaOrigen?: string;

    @IsString()
    @IsOptional()
    bancoOrigen?: string;

    @IsString()
    @IsOptional()
    beneficiario?: string;

    @IsString()
    @IsOptional()
    cuentaDestino?: string;

    @IsString()
    @IsOptional()
    bancoDestino?: string;

    @IsString()
    @IsOptional()
    textoOriginal?: string;

    @IsBoolean()
    @IsOptional()
    porOcr?: boolean;

    @IsBoolean()
    @IsOptional()
    porIa?: boolean;
}

export class SaveTransferenciaDto {

    @IsDateString()
    fecha: string;

    @IsNumber()
    ideTecbaOrigen: number;

    @IsNumber()
    ideTecbaDestino: number;

    @IsNumber()
    @Min(0.01)
    valor: number;

    /** Número de comprobante - siempre lo ingresa el usuario en esta pantalla. */
    @IsString()
    numero: string;

    @IsString()
    @IsOptional()
    observacion?: string;

    @ValidateNested()
    @Type(() => ComprobanteTransferenciaDto)
    @IsOptional()
    comprobante?: ComprobanteTransferenciaDto;
}
