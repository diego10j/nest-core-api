import { Type, Transform } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsPositive,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

export class InvEtiqueta {
    @IsOptional()
    @IsInt()
    ide_ineta?: number;

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsNotEmpty()
    @IsString()
    nombre_ineta: string;

    @IsNotEmpty()
    @IsString()
    tipo_ineta: string;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @Type(() => Number)
    @Transform(({ value }) => value || null)
    peso_ineta?: number;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    unidad_medida_ineta?: string;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    lote_ineta?: string;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    fecha_elaboracion_ineta?: string;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    fecha_vence_ineta?: string;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    notas_ineta?: string;
}

export class SaveEtiquetaDto {
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => InvEtiqueta)
    data: InvEtiqueta;

    @IsBoolean()
    isUpdate: boolean;
}
