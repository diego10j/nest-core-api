import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDateString,
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

export class IDetMenudeo {
    @IsInt()
    ide_inmpre: number;

    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0.001)
    cantidad_indmen: number;

    @IsNumber({ maxDecimalPlaces: 6 })
    @Min(0.000001)
    cant_base_indmen: number;

    @IsOptional()
    @IsString()
    observacion_indmen?: string;
}

export class ICabMenudeo {
    /** ID del comprobante — solo para UPDATE */
    @IsOptional()
    @IsInt()
    ide_incmen?: number;

    @IsInt()
    ide_inarti: number;

    /** Tipo de transacción de menudeo (FK → inv_men_tipo_tran) */
    @IsInt()
    ide_inmtt: number;

    @IsDateString()
    fecha_incmen: string;

    @IsOptional()
    @IsString()
    observacion_incmen?: string;

    /** Factura que originó el movimiento (solo tipo FAC) */
    @IsOptional()
    @IsInt()
    ide_cccfa?: number;

    /** Comprobante de menudeo de referencia (para reversos) */
    @IsOptional()
    @IsInt()
    ide_incmen_ref?: number;

    /** Bodega para el comprobante de inventario (requerida si genera egreso) */
    @IsOptional()
    @IsInt()
    ide_inbod?: number;
}

export class SaveMenudeoDto {
    /** true = actualizar comprobante existente */
    @IsOptional()
    @IsBoolean()
    isUpdate?: boolean;

    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => ICabMenudeo)
    data: ICabMenudeo;

    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => IDetMenudeo)
    detalle: IDetMenudeo[];
}
