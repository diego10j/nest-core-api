import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * Línea de detalle de cxp_detall_transa dentro del guardado tipo-diff de una cabecera.
 * `ide_cpdtr` ausente = fila nueva (INSERT); presente = fila existente (UPDATE).
 * `numero_pago_cpdtr` nunca viene del cliente, lo calcula el backend.
 * `ide_cpdno` (nota de crédito de CLIENTE, no de proveedor) queda fuera a propósito.
 */
export class DetalleTrnItemDto {
    @IsInt()
    @IsOptional()
    ide_cpdtr?: number;

    /** FK → cxp_tipo_transacc, define el signo (+/-) de la línea */
    @IsInt()
    @IsNotEmpty()
    ide_cpttr: number;

    /** FK → cxp_cabece_factur (factura o nota de crédito del proveedor) */
    @IsInt()
    @IsOptional()
    ide_cpcfa?: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_trans_cpdtr: string;

    @IsDateString()
    @IsOptional()
    fecha_venci_cpdtr?: string;

    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    valor_cpdtr: number;

    @IsString()
    @IsOptional()
    docum_relac_cpdtr?: string;

    @IsString()
    @IsOptional()
    observacion_cpdtr?: string;

    /** FK → con_cab_comp_cont (asiento contable), controlado por SearchAsientoProveedor en el front */
    @IsInt()
    @IsOptional()
    ide_cnccc?: number;

    /** FK → tes_cab_libr_banc (libro de bancos), controlado por SearchLibroBancoProveedor en el front */
    @IsInt()
    @IsOptional()
    ide_teclb?: number;
}
