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
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SaveDto } from 'src/common/dto/save.dto';

export class CabeceraComprobanteDataDto {
    @ApiPropertyOptional({ description: 'ID del comprobante (omitir para crear)' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cnccc?: number;

    @ApiPropertyOptional({ description: 'ID del usuario que genera el comprobante' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_usua?: number;

    @ApiProperty({ description: 'ID del tipo de comprobante' })
    @IsInt()
    @Type(() => Number)
    ide_cntcm: number;

    @ApiPropertyOptional({ description: 'ID del estado del comprobante' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cneco?: number;

    @ApiPropertyOptional({ description: 'ID del módulo' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_modu?: number;

    @ApiPropertyOptional({ description: 'ID de la persona/beneficiario' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_geper?: number;

    @ApiProperty({ description: 'Fecha de transacción' })
    @IsDateString()
    fecha_trans_cnccc: string;

    @ApiPropertyOptional({ description: 'Observación del comprobante' })
    @IsString()
    @IsOptional()
    observacion_cnccc?: string;

    @ApiPropertyOptional({ description: 'Número del comprobante', maxLength: 50 })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    numero_cnccc?: string;

    @ApiPropertyOptional({ description: 'Fecha del sistema' })
    @IsDateString()
    @IsOptional()
    fecha_siste_cnccc?: string;

    @ApiPropertyOptional({ description: 'Usuario que ingresa' })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    usuario_ingre?: string;

    @ApiPropertyOptional({ description: 'Es automático', default: false })
    @IsBoolean()
    @IsOptional()
    automatico_cnccc?: boolean;
}

export class DetalleComprobanteDataDto {
    @ApiPropertyOptional({ description: 'ID del detalle (omitir para crear)' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cndcc?: number;

    @ApiPropertyOptional({ description: 'ID de la cabecera del comprobante' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cnccc?: number;

    @ApiProperty({ description: 'ID del lugar de aplicación (1=DEBE, 0=HABER)' })
    @IsInt()
    @Type(() => Number)
    ide_cnlap: number;

    @ApiProperty({ description: 'ID de la cuenta contable (detalle plan de cuentas)' })
    @IsInt()
    @Type(() => Number)
    ide_cndpc: number;

    @ApiProperty({ description: 'Valor del movimiento' })
    @IsNumber()
    valor_cndcc: number;

    @ApiPropertyOptional({ description: 'Observación del detalle', maxLength: 190 })
    @IsString()
    @IsOptional()
    @MaxLength(190)
    observacion_cndcc?: string;

    @ApiPropertyOptional({ description: 'Referencia del detalle', maxLength: 80 })
    @IsString()
    @IsOptional()
    @MaxLength(80)
    referencia_cndcc?: string;
}

export class SaveComprobanteDto extends SaveDto {
    @ApiProperty({ description: 'Datos de la cabecera del comprobante' })
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => CabeceraComprobanteDataDto)
    declare data: CabeceraComprobanteDataDto;

    @ApiPropertyOptional({ description: 'Detalles del comprobante', type: [DetalleComprobanteDataDto] })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => DetalleComprobanteDataDto)
    detalles?: DetalleComprobanteDataDto[];
}

export class GetComprobantesDto extends QueryOptionsDto {
    @ApiProperty({ description: 'Fecha inicio del rango (YYYY-MM-DD)' })
    @IsDateString()
    fechaInicio: string;

    @ApiProperty({ description: 'Fecha fin del rango (YYYY-MM-DD)' })
    @IsDateString()
    fechaFin: string;
}

export class GetComprobanteByIdDto extends QueryOptionsDto {
    @ApiProperty({ description: 'ID del comprobante' })
    @IsInt()
    @Type(() => Number)
    ide_cnccc: number;
}

export class AnularComprobanteDto {
    @ApiProperty({ description: 'ID del comprobante a anular' })
    @IsInt()
    @Type(() => Number)
    ide_cnccc: number;

    @ApiPropertyOptional({ description: 'ID del estado ANULADO (si no se envía se busca automáticamente)' })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_cneco?: number;
}

export class GetComprobantesConErrorDto {
    @ApiProperty({ description: 'Fecha inicio (YYYY-MM-DD) desde la cual verificar errores' })
    @IsDateString()
    fechaInicio: string;
}

export class ReversarComprobanteDto {
    @ApiProperty({ description: 'ID del comprobante a reversar' })
    @IsInt()
    @Type(() => Number)
    ide_cnccc: number;

    @ApiPropertyOptional({ description: 'Observación adicional para la reversa' })
    @IsString()
    @IsOptional()
    observacion?: string;
}
