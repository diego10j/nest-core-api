import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProponerConfigPreciosIaDto {
  @IsInt()
  ide_inarti: number;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}

export class ConfigPrecioIaItemDto {
  /** Tipo de pago (contado, crédito…). null = aplica a cualquier tipo de pago. */
  @IsOptional()
  @IsInt()
  ide_cncfp?: number | null;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  rango1: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  rango2?: number | null;

  @IsBoolean()
  rango_infinito: boolean;

  /** Cantidad exacta con precio estándar (rango1); no es un rango. */
  @IsOptional()
  @IsBoolean()
  exacta?: boolean;

  @IsIn(['utilidad', 'fijo'])
  modo: 'utilidad' | 'fijo';

  /** % de utilidad (modo utilidad) o precio sin IVA (modo fijo). */
  @IsNumber({ maxDecimalPlaces: 4 })
  valor: number;

  @IsOptional()
  @IsBoolean()
  incluye_iva?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  observacion?: string;
}

export class AplicarConfigPreciosIaDto {
  @IsInt()
  ide_inarti: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ConfigPrecioIaItemDto)
  configuraciones: ConfigPrecioIaItemDto[];
}
