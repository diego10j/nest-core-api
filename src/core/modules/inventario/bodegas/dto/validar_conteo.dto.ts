// src/inventario/dto/validar-detalles-conteo.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsString,
    IsOptional,
    IsArray,
    ValidateNested,
    IsNotEmpty,
    IsNumber,
    IsPositive,
    IsBoolean,
} from 'class-validator';

class DetalleConteoDto {
    @ApiProperty({
        description: 'ID del detalle de conteo físico',
        example: 710,
    })
    @IsNumber()
    @IsPositive()
    @IsNotEmpty()
    ide_indcf: number;

    @ApiProperty({
        description: 'Cantidad ajustada para el conteo',
        example: 150.5,
    })
    @IsNumber()
    @IsNotEmpty()
    cantidad_ajuste_indcf: number;

    @ApiPropertyOptional({
        description: 'Motivo de la diferencia encontrada',
        example: 'Conteo físico correcto',
    })
    @IsOptional()
    @IsString()
    motivo_diferencia_indcf?: string;

    @ApiProperty({
        description: 'Indica si el ajuste está aprobado (siempre true)',
        example: true,
        default: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    aprobado_ajuste_indcf: boolean = true;
}

export class ValidarDetallesConteoDto {
    @ApiProperty({
        description: 'Array de detalles de conteo a validar',
        type: [DetalleConteoDto],
        example: [
            {
                ide_indcf: 710,
                cantidad_ajuste_indcf: 150.5,
                motivo_diferencia_indcf: 'Conteo físico correcto',
                aprobado_ajuste_indcf: true,
            },
            {
                ide_indcf: 629,
                cantidad_ajuste_indcf: 2,
                motivo_diferencia_indcf: 'Producto dañado',
                aprobado_ajuste_indcf: true,
            },
        ],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DetalleConteoDto)
    @IsNotEmpty()
    detalles: DetalleConteoDto[];


}