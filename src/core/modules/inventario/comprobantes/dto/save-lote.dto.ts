import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
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
  @IsOptional()
  @IsInt()
  @IsPositive()
  ide_inlot?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lote_inlot?: string;

  @IsOptional()
  @IsDateString()
  fecha_ingreso_inlot?: string;

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
  diferencia_peso_inlot?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  ide_indci_ingreso?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  ide_indci_egreso?: number;

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
  usuario_verif_inlot?: string;

  @IsOptional()
  @IsDateString()
  fecha_verif_inlot?: string;

  @IsOptional()
  @IsBoolean()
  verificado_inlot?: boolean;


  @IsOptional()
  @IsNumber()
  @Min(0)
  peso_verifica_inlot?: number;

  @IsOptional()
  @IsNumber()
  inv_ide_inlot?: number;
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
