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

/** DTO para el vínculo producto ↔ forma de menudeo */
export class InvMenPresentacion {
    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_inmpre?: number;

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    ide_inmfor: number;

    @IsInt()
    @IsPositive()
    ide_empr: number;

    /** Override de cant_base de la forma; NULL = usa valor por defecto */
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 6 })
    @Min(0.000001)
    cant_base_inmpre?: number;

    /** Si el saldo cae por debajo de este valor se genera alerta de reposición */
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    stock_minimo_inmpre?: number;

    /** Stock al que se debería reponer la presentación */
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    stock_ideal_inmpre?: number;

    @IsOptional()
    @IsString()
    @Transform(({ value }) => value || null)
    observacion_inmpre?: string;

    @IsBoolean()
    activo_inmpre: boolean;
}

export class SavePresentacionDto {
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => InvMenPresentacion)
    data: InvMenPresentacion;

    @IsBoolean()
    isUpdate: boolean;
}
