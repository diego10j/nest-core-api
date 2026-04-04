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

export class ICrearDetMenudeo {
    /** Presentación (vínculo producto ↔ forma) */
    @IsInt()
    ide_inmpre: number;

    /** Unidades de la presentación a fraccionar */
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(1)
    cantidad_indmen: number;

    @IsOptional()
    @IsString()
    observacion_indmen?: string;
}

export class CrearMenudeoDto {
    /** Fecha del comprobante de menudeo */
    @IsDateString()
    fecha_incmen: string;

    @IsOptional()
    @IsString()
    observacion_incmen?: string;

    /** Presentaciones a fraccionar. Todas deben pertenecer al mismo producto base. */
    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ICrearDetMenudeo)
    detalle: ICrearDetMenudeo[];
}
