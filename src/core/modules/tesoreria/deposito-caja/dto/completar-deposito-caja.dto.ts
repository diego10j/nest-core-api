import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsDateString,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Comprobante del depósito físico. `fotoTeincb` es el nombre de archivo devuelto por POST
 * tesoreria/comprobante-banco/uploadComprobante (subido antes de Completar); el resto de campos
 * son los detectados por OCR/IA (procesarImagenTransferencia/procesarImagenTransferenciaGpt) y
 * confirmados/corregidos por el usuario.
 */
export class ComprobanteDepositoCajaDto {
    @IsString()
    @IsNotEmpty()
    fotoTeincb: string;

    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valorTeincb: number;

    @IsString()
    @IsOptional()
    numComprobanteTeincb?: string;

    @IsDateString()
    @IsOptional()
    fechaTeincb?: string;

    @IsString()
    @IsOptional()
    ordenanteTeincb?: string;

    @IsString()
    @IsOptional()
    cuentaOrigenTeincb?: string;

    @IsString()
    @IsOptional()
    bancoOrigenTeincb?: string;

    @IsString()
    @IsOptional()
    beneficiarioTeincb?: string;

    @IsString()
    @IsOptional()
    cuentaDestinoTeincb?: string;

    @IsString()
    @IsOptional()
    bancoDestinoTeincb?: string;

    @IsString()
    @IsOptional()
    textoOriginalTeincb?: string;

    @IsBoolean()
    @IsOptional()
    porOcrTeincb?: boolean;

    @IsBoolean()
    @IsOptional()
    porIaTeincb?: boolean;
}

/**
 * Payload de la etapa "Completar" del wizard de Depósitos de Caja - se llama sobre un depósito
 * ya generado, cuando el usuario ya hizo el depósito físico en el banco. Aquí sí se generan el
 * retiro de caja + el ingreso a banco + el asiento contable (ver DepositoCajaSaveService.completar).
 */
export class CompletarDepositoCajaDto {
    /** Fecha real del depósito */
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** Número de comprobante del depósito */
    @IsString()
    @IsOptional()
    numero?: string;

    @ValidateNested()
    @Type(() => ComprobanteDepositoCajaDto)
    @IsNotEmpty()
    comprobante: ComprobanteDepositoCajaDto;
}
