import { Type } from 'class-transformer';
import {
    IsArray,
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
 * Detalle del comprobante de retención de venta (con_detall_retenc)
 */
export class DetalleRetencionVentaDto {
    /** FK → con_cabece_impues (impuesto/casillero) */
    @IsInt()
    @IsNotEmpty()
    ide_cncim: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    porcentaje_cndre: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    base_cndre: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    valor_cndre: number;
}

/**
 * Comprobante de retención recibido en una venta (con_cabece_retenc, es_venta_cncre=true) -
 * ej. retención de Bendo/procesador de tarjeta sobre el depósito de una venta con tarjeta, o
 * retención de un cliente que paga la factura.
 */
export class SaveRetencionVentaDto {
    /** FK → cxc_cabece_factura (factura a la que se retiene) */
    @IsInt()
    @IsNotEmpty()
    ide_cccfa: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_emisi_cncre: string;

    @IsString()
    @IsNotEmpty()
    numero_cncre: string;

    @IsString()
    @IsNotEmpty()
    autorizacion_cncre: string;

    @IsString()
    @IsOptional()
    observacion_cncre?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetalleRetencionVentaDto)
    @IsNotEmpty()
    detalles: DetalleRetencionVentaDto[];
}

export class AnularRetencionVentaDto {
    /** FK → con_cabece_retenc */
    @IsInt()
    @IsNotEmpty()
    ide_cncre: number;
}

/**
 * Edición del comprobante de retención de una factura de venta ya registrado (corrige un
 * error de digitación al importar/registrar el comprobante recibido del cliente). Solo
 * permitido si la transacción CxC de retención no ha sido aplicada a un cobro.
 */
export class EditarRetencionVentaDto {
    /** FK → con_cabece_retenc */
    @IsInt()
    @IsNotEmpty()
    ide_cncre: number;

    @IsDateString()
    @IsOptional()
    fecha_emisi_cncre?: string;

    @IsString()
    @IsOptional()
    numero_cncre?: string;

    @IsString()
    @IsOptional()
    autorizacion_cncre?: string;

    @IsString()
    @IsOptional()
    observacion_cncre?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetalleRetencionVentaDto)
    @IsOptional()
    detalles?: DetalleRetencionVentaDto[];
}

export class IdFacturaVentaDto {
    /** FK → cxc_cabece_factura */
    @IsInt()
    @IsNotEmpty()
    ide_cccfa: number;
}
