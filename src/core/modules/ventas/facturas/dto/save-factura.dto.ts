import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

export class DetaFacturaDto {
    @IsInt()
    ide_inarti: number;

    @IsNumber()
    @Min(0.001)
    cantidad_ccdfa: number;

    @IsNumber()
    @Min(0)
    precio_ccdfa: number;

    @IsNumber()
    @Min(0)
    total_ccdfa: number;

    /** 0 = tarifa 0%, 2 = IVA, según variable de sistema */
    @IsInt()
    iva_inarti_ccdfa: number;

    @IsBoolean()
    @IsOptional()
    credito_tributario_ccdfa?: boolean = false;

    @IsString()
    @IsOptional()
    @MaxLength(150)
    observacion_ccdfa?: string;

    @IsInt()
    @IsOptional()
    ide_inuni?: number;
}

export class SaveFacturaDto {
    // ─── Punto de emisión ────────────────────────────────────────────────
    @IsInt()
    ide_ccdaf: number;

    // ─── Cabecera ────────────────────────────────────────────────────────
    @IsDateString()
    fecha_emisi_cccfa: string;

    @IsInt()
    ide_geper: number;

    @IsInt()
    @IsOptional()
    ide_vgven?: number;

    /** Forma de pago (con_deta_forma_pago) */
    @IsInt()
    @IsOptional()
    ide_cndfp1?: number;

    @IsInt()
    @IsOptional()
    dias_credito_cccfa?: number = 0;

    @IsString()
    @IsOptional()
    @MaxLength(180)
    direccion_cccfa?: string;

    @IsString()
    @IsOptional()
    correo_cccfa?: string;

    @IsString()
    @IsOptional()
    observacion_cccfa?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    tarifa_iva_cccfa?: number;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    orden_compra_cccfa?: string;

    // ─── Detalle ─────────────────────────────────────────────────────────
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => DetaFacturaDto)
    @IsNotEmpty()
    detalles: DetaFacturaDto[];
}
