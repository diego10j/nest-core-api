import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveFlujoClasifDto {
    @ApiPropertyOptional({ description: 'ID de clasificación (omitir para crear)' })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    ide_cnfcc?: number;

    @ApiProperty({ description: 'ID de cuenta del plan de cuentas' })
    @IsInt()
    @Type(() => Number)
    ide_cndpc: number;

    @ApiProperty({
        description: 'Sección del flujo de efectivo',
        enum: ['OPERACION', 'INVERSION', 'FINANCIAMIENTO'],
    })
    @IsIn(['OPERACION', 'INVERSION', 'FINANCIAMIENTO'])
    clasificacion_cnfcc: 'OPERACION' | 'INVERSION' | 'FINANCIAMIENTO';

    @ApiPropertyOptional({ description: 'TRUE para partidas no monetarias (depreciación, provisiones)' })
    @IsOptional()
    @IsBoolean()
    es_no_monetaria_cnfcc?: boolean;

    @ApiPropertyOptional({ description: 'Etiqueta personalizada en el reporte (usa nombre de cuenta si es null)', maxLength: 120 })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    descripcion_cnfcc?: string;

    @ApiPropertyOptional({ description: 'Orden de presentación dentro de la sección' })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    orden_cnfcc?: number;
}

export class DeleteFlujoClasifDto {
    @ApiProperty({ description: 'IDs de clasificaciones a eliminar' })
    @IsInt({ each: true })
    @Type(() => Number)
    ide: number[];
}
