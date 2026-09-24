import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Un pago (factura de venta cobrada con tarjeta) que cubre una acreditación, con los valores que
 * el procesador aplicó según su Excel de liquidación. Si no se cargó el Excel solo viaja `valor`.
 */
export class PagoAcreditadoDto {
    /** FK → cxc_cabece_factura */
    @IsInt()
    @IsNotEmpty()
    ide_cccfa: number;

    /** Valor bruto cobrado con tarjeta de esta factura */
    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    comision?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    ivaComision?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    retIva?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    retRenta?: number;

    /** Número de liquidación del procesador (trazabilidad) */
    @IsString()
    @IsOptional()
    numeroLiquidacion?: string;
}

/**
 * Comprobante de la transferencia bancaria real del neto a la cuenta destino. `fotoTeincb` es
 * el nombre de archivo devuelto por POST tesoreria/comprobante-banco/uploadComprobante (subido
 * antes de registrar); el resto de campos son los detectados por OCR/IA
 * (procesarImagenTransferencia/procesarImagenTransferenciaGpt) y confirmados por el usuario.
 */
export class ComprobanteTransferenciaDevolucionDto {
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
 * Registro de UNA acreditación del procesador de tarjeta (una transferencia del neto a la cuenta
 * real, que cubre 1..N pagos): mueve el neto desde la cuenta de tarjeta y guarda la trazabilidad.
 * La comisión y la retención NO viajan aquí: llegan en los cortes del procesador y se registran
 * aparte (ver RegistrarCorteTarjetaDto), en cualquier orden.
 */
export class RegistrarAcreditacionTarjetaDto {
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** FK → tes_cuenta_banco (cuenta del procesador de tarjeta, origen) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    /** FK → tes_cuenta_banco (cuenta bancaria real destino de la acreditación) */
    @IsInt()
    @IsNotEmpty()
    ideTecbaDestino: number;

    /** FK → gen_persona (procesador de tarjeta, ej. Bendo) */
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => PagoAcreditadoDto)
    facturas: PagoAcreditadoDto[];

    @ValidateNested()
    @Type(() => ComprobanteTransferenciaDevolucionDto)
    @IsNotEmpty()
    comprobante: ComprobanteTransferenciaDevolucionDto;

    @IsString()
    @IsOptional()
    observacion?: string;
}
