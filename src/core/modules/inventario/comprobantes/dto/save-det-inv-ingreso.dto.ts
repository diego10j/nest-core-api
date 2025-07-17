import {
    IsNotEmpty,
    IsObject,
    ValidateNested,
    IsNumber,
    IsOptional,
    Min,
    IsDateString,
    IsInt,
    IsPositive,
    IsBoolean,
    IsString
} from 'class-validator';
import { Type } from 'class-transformer';

export class IDetInvIngresoDto {

    @IsInt()
    @IsPositive()
    ide_indci: number;

    @IsBoolean()
    verifica_indci:boolean;

    @IsString()
    @IsOptional()
    lote_indci?: string;

    @IsDateString()
    @IsOptional()
    fecha_caduca_indci?: string;

    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @IsOptional()
    peso_marcado_indci?: number;

    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @IsOptional()
    peso_tara_indci?: number;

    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    @IsOptional()
    peso_real_indci?: number;

    @IsString()
    @IsOptional()
    foto_indci?: string;

    @IsString()
    @IsOptional()
    archivo_indci?: string;

}

export class SaveDetInvIngresoDtoDto {

    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => IDetInvIngresoDto)
    data: IDetInvIngresoDto;
}