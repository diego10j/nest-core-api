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
    Min,
    ValidateNested,
} from 'class-validator';

export class InvMenForma {
    @IsOptional()
    @IsInt()
    ide_inmfor?: number;

    @IsInt()
    ide_empr: number;

    @IsOptional()
    @IsInt()
    ide_inuni?: number;

    @IsNotEmpty()
    @IsString()
    nombre_inmfor: string;

    @IsNumber({ maxDecimalPlaces: 6 })
    @Min(0.000001)
    cant_base_inmfor: number;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    descripcion_inmfor?: string;

    @IsBoolean()
    activo_inmfor: boolean;
}

export class InvMenFormaInsumo {
    @IsOptional()
    @IsInt()
    ide_inmfin?: number;

    @IsInt()
    ide_inmfor: number;

    @IsInt()
    ide_inarti: number;

    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.0001)
    cantidad_inmfin: number;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    observacion_inmfin?: string;
}

export class SaveFormaDto {
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => InvMenForma)
    data: InvMenForma;

    @IsBoolean()
    isUpdate: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InvMenFormaInsumo)
    insumos?: InvMenFormaInsumo[];
}
