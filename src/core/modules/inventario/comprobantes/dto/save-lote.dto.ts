import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDate,
  IsDateString,
  Min,
  MaxLength,
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsInt,
  IsPositive,
} from 'class-validator';

export class LoteDto {
  @IsNumber()
  @IsOptional()
  ide_inlot?: number;

  @IsString()
  @MaxLength(50)
  lote_inlot: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fecha_ingreso_inlot?: Date;

  @IsOptional()
  @IsDateString()
  fecha_caducidad_inlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pais_inlot?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  peso_inlot?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  peso_tara_inlot?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diferencia_peso_inlot?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock_anterior_inlot?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stock_posterior_inlot?: number;

  @IsInt()
  @IsPositive()
  ide_indci_ingreso: number;

  @IsOptional()
  @IsBoolean()
  es_saldo_inicial?: boolean;

  @IsOptional()
  @IsBoolean()
  activo_inlot?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  archivo1_inlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  archivo2_inlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  archivo3_inlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  observacion_inlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  usuario_ingre?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fecha_ingre?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  usuario_actua?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fecha_actua?: Date;
}

export class SaveLoteDto {
  @IsBoolean()
  isUpdate: boolean;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => LoteDto)
  data: LoteDto;
}
