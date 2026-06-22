import { Type } from 'class-transformer';
import {
    IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, Min, ValidateNested,
} from 'class-validator';

export class DetRentabilidadItemDto {
    @IsInt()
    @IsNotEmpty()
    ide_imdet: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    precio_venta_imdet?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentaje_utilidad_imdet?: number;
}

export class SaveRentabilidadDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    porcentaje_utilidad_global?: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetRentabilidadItemDto)
    @IsOptional()
    detalles?: DetRentabilidadItemDto[];
}
