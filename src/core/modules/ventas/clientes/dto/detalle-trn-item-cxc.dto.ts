import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * Línea de detalle de cxc_detall_transa dentro del guardado tipo-diff de una cabecera.
 * `ide_ccdtr` ausente = fila nueva (INSERT); presente = fila existente (UPDATE).
 * `numero_pago_ccdtr` nunca viene del cliente (front), lo calcula el backend.
 */
export class DetalleTrnItemCxCDto {
    @IsInt()
    @IsOptional()
    ide_ccdtr?: number;

    /** FK → cxc_tipo_transacc, define el signo (+/-) de la línea */
    @IsInt()
    @IsNotEmpty()
    ide_ccttr: number;

    /** FK → cxc_cabece_factura (factura del cliente) */
    @IsInt()
    @IsOptional()
    ide_cccfa?: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_trans_ccdtr: string;

    @IsDateString()
    @IsOptional()
    fecha_venci_ccdtr?: string;

    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    valor_ccdtr: number;

    @IsString()
    @IsOptional()
    docum_relac_ccdtr?: string;

    @IsString()
    @IsOptional()
    observacion_ccdtr?: string;

    /** FK → con_cab_comp_cont (asiento contable), controlado por SearchAsientoCliente en el front */
    @IsInt()
    @IsOptional()
    ide_cnccc?: number;

    /** FK → tes_cab_libr_banc (libro de bancos), controlado por SearchLibroBancoCliente en el front */
    @IsInt()
    @IsOptional()
    ide_teclb?: number;
}
