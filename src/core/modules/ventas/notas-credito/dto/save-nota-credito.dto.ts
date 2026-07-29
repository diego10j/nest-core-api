import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Detalle de la nota de crédito (cxp_detalle_nota — nombre heredado del legacy,
 * es en realidad de ventas/CxC, no de cuentas por pagar).
 */
export class DetalleNotaCreditoDto {
    /** FK → inv_articulo */
    @IsInt()
    @IsNotEmpty()
    ide_inarti: number;

    @IsInt()
    @IsOptional()
    ide_inuni?: number;

    @IsNumber()
    @Min(0.000001)
    @IsNotEmpty()
    cantidad_cpdno: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    precio_cpdno: number;

    /** '1' = con IVA, '-1' = tarifa 0%, '0' = no objeto de IVA (paridad legacy) */
    @IsIn(['1', '-1', '0'])
    @IsNotEmpty()
    iva_inarti_cpdno: string;

    @IsString()
    @IsOptional()
    observacion_cpdno?: string;
}

/**
 * Nota de crédito de venta (cxp_cabecera_nota). Reversa (total o parcial) de una
 * factura de venta ya emitida; genera comprobante electrónico SRI tipo '04' cuando
 * el punto de emisión es electrónico.
 */
export class SaveNotaCreditoDto {
    /** FK → cxc_cabece_factura (factura relacionada/modificada) */
    @IsInt()
    @IsNotEmpty()
    ide_cccfa: number;

    /** FK → cxc_datos_fac (punto de emisión de la nota de crédito) */
    @IsInt()
    @IsNotEmpty()
    ide_ccdaf: number;

    /** FK → cxp_motivo_nota */
    @IsInt()
    @IsNotEmpty()
    ide_cpmno: number;

    /** FK → con_deta_forma_pago */
    @IsInt()
    @IsNotEmpty()
    ide_cndfp: number;

    @IsDateString()
    @IsOptional()
    fecha_emisi_cpcno?: string;

    @IsString()
    @IsOptional()
    observacion_cpcno?: string;

    @IsEmail()
    @IsOptional()
    correo_cpcno?: string;

    /** Porcentaje de IVA a aplicar a los detalles con iva_inarti_cpdno='1' (default 15) */
    @IsNumber()
    @IsOptional()
    tarifa_iva_cpcno?: number;

    /**
     * Detalle de la nota de crédito. Si se omite, se copia 1:1 del detalle de la
     * factura relacionada (paridad con buscaFactura() del legacy); si se envía,
     * se usa tal cual (permite editar cantidades/líneas antes de guardar).
     */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetalleNotaCreditoDto)
    @IsOptional()
    detalles?: DetalleNotaCreditoDto[];
}

export class AnularNotaCreditoDto {
    /** FK → cxp_cabecera_nota */
    @IsInt()
    @IsNotEmpty()
    ide_cpcno: number;
}
