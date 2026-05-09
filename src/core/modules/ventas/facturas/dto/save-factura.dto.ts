import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SaveDto } from 'src/common/dto/save.dto';

// ── DETALLE ──

export class DetaFacturaDto {
    @ApiProperty({ description: 'ID del artículo' })
    @IsInt()
    ide_inarti: number;

    @ApiProperty({ description: 'Cantidad', minimum: 0.001 })
    @IsNumber()
    @Min(0.001)
    cantidad_ccdfa: number;

    @ApiProperty({ description: 'Precio unitario', minimum: 0 })
    @IsNumber()
    @Min(0)
    precio_ccdfa: number;

    @ApiProperty({ description: 'Total de la línea', minimum: 0 })
    @IsNumber()
    @Min(0)
    total_ccdfa: number;

    @ApiProperty({ description: '0 = tarifa 0%, 2 = graba IVA' })
    @IsInt()
    iva_inarti_ccdfa: number;

    @ApiPropertyOptional({ description: 'Crédito tributario' })
    @IsBoolean()
    @IsOptional()
    credito_tributario_ccdfa?: boolean = false;

    @ApiPropertyOptional({ description: 'Observación del ítem', maxLength: 150 })
    @IsString()
    @IsOptional()
    @MaxLength(150)
    observacion_ccdfa?: string;

    @ApiPropertyOptional({ description: 'ID de la unidad de medida' })
    @IsInt()
    @IsOptional()
    ide_inuni?: number;
}

// ── CABECERA ──

export class CabeceraFacturaDataDto {
    @ApiPropertyOptional({ description: 'ID de la factura (omitir para crear)' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cccfa?: number;

    @ApiProperty({ description: 'ID del punto de emisión' })
    @IsInt()
    @Type(() => Number)
    ide_ccdaf: number;

    @ApiProperty({ description: 'ID del cliente' })
    @IsInt()
    @Type(() => Number)
    ide_geper: number;

    @ApiProperty({ description: 'Fecha de emisión' })
    @IsDateString()
    fecha_emisi_cccfa: string;

    @ApiPropertyOptional({ description: 'ID del vendedor' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_vgven?: number;

    @ApiPropertyOptional({ description: 'Forma de pago (con_deta_forma_pago)' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cndfp1?: number;

    @ApiPropertyOptional({ description: 'Días de crédito', default: 0 })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    dias_credito_cccfa?: number = 0;

    @ApiPropertyOptional({ description: 'Dirección', maxLength: 180 })
    @IsString()
    @IsOptional()
    @MaxLength(180)
    direccion_cccfa?: string;

    @ApiPropertyOptional({ description: 'Correo electrónico', maxLength: 100 })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    correo_cccfa?: string;

    @ApiPropertyOptional({ description: 'Observación' })
    @IsString()
    @IsOptional()
    observacion_cccfa?: string;

    @ApiPropertyOptional({ description: 'Tarifa de IVA personalizada (default 15%)' })
    @IsNumber()
    @IsOptional()
    @Min(0)
    @Type(() => Number)
    tarifa_iva_cccfa?: number;

    @ApiPropertyOptional({ description: 'Orden de compra', maxLength: 50 })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    orden_compra_cccfa?: string;
}

// ── SAVE DTO ──

export class SaveFacturaDto extends SaveDto {
    @ApiProperty({ description: 'Datos de la cabecera de la factura' })
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => CabeceraFacturaDataDto)
    declare data: CabeceraFacturaDataDto;

    @ApiProperty({ description: 'Detalles de la factura', type: [DetaFacturaDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => DetaFacturaDto)
    @IsNotEmpty()
    detalles: DetaFacturaDto[];
}
