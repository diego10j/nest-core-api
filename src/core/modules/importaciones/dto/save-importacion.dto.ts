import { Type } from 'class-transformer';
import {
    IsArray, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested,
} from 'class-validator';

export class DetImportacionDataDto {
    @IsOptional()
    @IsInt()
    ide_imdet?: number;

    @IsInt()
    @IsNotEmpty()
    ide_inarti: number;

    @IsInt()
    @IsOptional()
    ide_inuni?: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    cantidad_imdet: number;

    @IsNumber()
    @Min(0)
    @IsNotEmpty()
    precio_unitario_imdet: number;

    @IsString()
    @IsOptional()
    descripcion_prod_imdet?: string;

    @IsString()
    @IsOptional()
    num_paquetes_imdet?: string;

    @IsString()
    @IsOptional()
    observaciones_imdet?: string;

    @IsString()
    @IsNotEmpty()
    partida_aduana_imdet: string;

    @IsString()
    @IsNotEmpty()
    descripcion_partida_imdet: string;

    @IsString()
    @IsOptional()
    categoria_imdet?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    peso_neto_imdet?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    peso_carga_imdet?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    volumen_unitario_imdet?: number;

    @IsNumber()
    @IsOptional()
    impuesto_ad_valorem_imdet?: number;

    @IsString()
    @IsOptional()
    regulacion_ecuatoriana_imdet?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    precio_venta_imdet?: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    @IsOptional()
    porcentaje_utilidad_imdet?: number;
}

export class CabImportacionDataDto {
    @IsOptional()
    @IsInt()
    ide_imcaim?: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsInt()
    @IsNotEmpty()
    ide_iminco: number;

    @IsInt()
    @IsNotEmpty()
    ide_imesor: number;

    @IsInt()
    @IsOptional()
    ide_gepais?: number;

    @IsDateString()
    @IsNotEmpty()
    fecha_imcaim: string;

    @IsDateString()
    @IsOptional()
    fecha_produccion_imcaim?: string;

    @IsDateString()
    @IsOptional()
    fecha_factura_imcaim?: string;

    @IsString()
    @IsOptional()
    num_factura_imcaim?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    total_factura_imcaim?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    peso_neto_imcaim?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    peso_carga_imcaim?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    volumen_carga_imcaim?: number;

    @IsString()
    @IsOptional()
    observaciones_imcaim?: string;
}

export class SaveImportacionDto {
    @ValidateNested()
    @Type(() => CabImportacionDataDto)
    @IsNotEmpty()
    data: CabImportacionDataDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetImportacionDataDto)
    @IsOptional()
    detalles?: DetImportacionDataDto[];
}
