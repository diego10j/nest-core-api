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

/** Una factura de venta cobrada con tarjeta cubierta por este ciclo de devolución */
export class FacturaCubiertaDevolucionDto {
    /** FK → cxc_cabece_factura */
    @IsInt()
    @IsNotEmpty()
    ide_cccfa: number;

    /** Valor cobrado con tarjeta de esta factura (para el cálculo del neto y la trazabilidad) */
    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor: number;
}

/**
 * Comprobante de la transferencia bancaria real del neto a la cuenta destino. `fotoTeincb` es
 * el nombre de archivo devuelto por POST tesoreria/comprobante-banco/uploadComprobante (subido
 * antes de Finalizar); el resto de campos son los detectados por OCR/IA
 * (procesarImagenTransferencia/procesarImagenTransferenciaGpt) y confirmados/corregidos por el
 * usuario en el wizard.
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
 * Payload único del botón "Finalizar" del wizard de Devolución de Cobros con Tarjeta - todo el
 * ciclo (pago de la comisión, retención opcional, transferencia del neto y trazabilidad) se
 * ejecuta en una sola llamada atómica (ver DevolucionCobroTarjetaSaveService.finalizar).
 *
 * La factura de comisión (`ideCpcfa`) y la retención (`ideCncre`, opcional) NO se crean aquí -
 * el frontend las guarda ANTES de llamar a este endpoint reutilizando los diálogos existentes de
 * Compras (CrearFacturaCxPDialog) y Ventas (RegistrarRetencionVentaDialog), que ya saben parsear
 * el XML y persistir con su propio flujo probado.
 */
export class FinalizarDevolucionTarjetaDto {
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** FK → tes_cuenta_banco (cuenta del procesador de tarjeta, origen, bloqueada en el wizard) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    /** FK → tes_cuenta_banco (cuenta bancaria real destino de la acreditación) */
    @IsInt()
    @IsNotEmpty()
    ideTecbaDestino: number;

    /** FK → gen_persona (proveedor/procesador que factura la comisión, ej. Bendo) */
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => FacturaCubiertaDevolucionDto)
    facturas: FacturaCubiertaDevolucionDto[];

    /** FK → cxp_cabece_factur, factura de comisión ya guardada (XML nuevo o ya cargada por Compras) */
    @IsInt()
    @IsNotEmpty()
    ideCpcfa: number;

    /** FK → con_cabece_retenc, comprobante de retención ya guardado - opcional */
    @IsInt()
    @IsOptional()
    ideCncre?: number;

    @ValidateNested()
    @Type(() => ComprobanteTransferenciaDevolucionDto)
    @IsNotEmpty()
    comprobante: ComprobanteTransferenciaDevolucionDto;

    @IsString()
    @IsOptional()
    observacion?: string;
}
