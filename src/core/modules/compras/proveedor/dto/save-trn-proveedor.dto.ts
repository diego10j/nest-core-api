import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Transacción manual de cuentas por pagar del proveedor
 * (cxp_detall_transa — pantalla "Ingresar Transacción" del legacy)
 */
export class SaveTrnProveedorDto {
    /** FK → gen_persona (proveedor) */
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    /** FK → cxp_tipo_transacc */
    @IsInt()
    @IsNotEmpty()
    ide_cpttr: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_trans_cpdtr: string;

    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    valor_cpdtr: number;

    @IsString()
    @IsNotEmpty()
    observacion_cpdtr: string;

    @IsString()
    @IsOptional()
    docum_relac_cpdtr?: string;

    /** Cuenta por pagar existente a la que se asocia la transacción (cxp_cabece_transa) */
    @IsInt()
    @IsOptional()
    ide_cpctr?: number;

    /** Número de asiento contable existente a vincular (con_cab_comp_cont) */
    @IsInt()
    @IsOptional()
    ide_cnccc?: number;
}
