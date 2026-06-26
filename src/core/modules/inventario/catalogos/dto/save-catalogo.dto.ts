import { Type, Transform } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

export class InvCabCatalogo {
    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_inccat?: number;

    @IsOptional()
    @IsInt()
    @Transform(({ value }) => value || null)
    ide_tipo_inccat?: number | null;

    @IsNotEmpty()
    @IsString()
    @MaxLength(150)
    nombre_inccat: string;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    descripcion_inccat?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    @Transform(({ value }) => value || null)
    desc_corta_inccat?: string | null;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value ?? true)
    estado_inccat?: boolean;

    @IsOptional()
    @IsInt()
    @Transform(({ value }) => value ?? 0)
    orden_inccat?: number;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    imagen_inccat?: string | null;

    @IsOptional()
    @IsArray()
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                return null;
            }
        }
        return value ? [value] : null;
    })
    imagenes_inccat?: string[] | null;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value || null)
    path_inccat?: string | null;

    @IsOptional()
    @IsInt()
    @Transform(({ value }) => value ?? 0)
    vistas_inccat?: number;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    @Transform(({ value }) => value || null)
    color_inccat?: string | null;
}

export class InvCantDetCatalogo {
    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_incdc?: number;

    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @Transform(({ value }) => value ?? 0)
    cantidad_incdc: number;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    @Transform(({ value }) => value || null)
    unidad_medida_incdc?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => value || null)
    descripcion_incdc?: string | null;

    @IsOptional()
    @IsInt()
    @Transform(({ value }) => value ?? 0)
    orden_incdc?: number;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value ?? true)
    activo_incdc?: boolean;
}

export class InvDetCatalogo {
    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_indcat?: number;

    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_inccat?: number;

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsOptional()
    @IsInt()
    @Transform(({ value }) => value ?? 0)
    orden_indcat?: number;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value ?? true)
    activo_indcat?: boolean;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value ?? true)
    publica_sin_stock_indcat?: boolean;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    descripcion_indcat?: string | null;

    @IsOptional()
    @IsArray()
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
                return null;
            }
        }
        return value ? [value] : null;
    })
    fotos_indcat?: string[] | null;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    video_indcat?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => value || null)
    url_indcat?: string | null;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvCantDetCatalogo)
    cantidades?: InvCantDetCatalogo[];
}

export class SaveCatalogoDto {
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => InvCabCatalogo)
    cabecera: InvCabCatalogo;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvDetCatalogo)
    detalle: InvDetCatalogo[];

    @IsBoolean()
    isUpdate: boolean;
}
