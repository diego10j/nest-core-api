import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { DetalleRetencionVentaDto } from 'src/core/modules/ventas/facturas/dto/save-retencion-venta.dto';

/** Comprobante de retención del corte, TAL COMO viene en el XML (total del corte, sin desglosar) */
export class RetencionCorteDto {
    @IsDateString()
    @IsNotEmpty()
    fecha_emisi_cncre: string;

    @IsString()
    @IsNotEmpty()
    numero_cncre: string;

    @IsString()
    @IsNotEmpty()
    autorizacion_cncre: string;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => DetalleRetencionVentaDto)
    detalles: DetalleRetencionVentaDto[];
}

/**
 * Registro de un corte del procesador de tarjeta (ej. Bendo, dos al mes): su factura de comisión
 * y/o su comprobante de retención sobre el mismo conjunto de pagos. Cada documento se contabiliza
 * contra la cuenta de tarjeta (pago de la comisión, nota de débito de la retención), sin
 * depender de que las acreditaciones de esos pagos ya estén registradas.
 */
export class RegistrarCorteTarjetaDto {
    @IsDateString()
    @IsNotEmpty()
    fecha: string;

    /** FK → tes_cuenta_banco (cuenta del procesador de tarjeta) */
    @IsInt()
    @IsNotEmpty()
    ideTecba: number;

    /** FK → cxp_cabece_factur, factura de comisión ya guardada (XML nuevo o ya cargada por Compras) */
    @IsInt()
    @IsOptional()
    ideCpcfa?: number;

    @ValidateNested()
    @Type(() => RetencionCorteDto)
    @IsOptional()
    retencion?: RetencionCorteDto;

    /** Pagos (facturas de venta cobradas con tarjeta) que ampara el corte */
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    facturas: number[];

    @IsString()
    @IsOptional()
    observacion?: string;
}
