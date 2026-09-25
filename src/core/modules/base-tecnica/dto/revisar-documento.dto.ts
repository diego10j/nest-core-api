import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { TIPOS_DOCUMENTO_BDT } from '../constants/base-tecnica.constants';

export class CorreccionValorDto {
  @IsInt()
  ide_bdval: number;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  valor_texto?: string;

  @IsNumber()
  @IsOptional()
  valor_num?: number | null;

  @IsNumber()
  @IsOptional()
  valor_min?: number | null;

  @IsNumber()
  @IsOptional()
  valor_max?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  unidad?: string;
}

/** Resultado de la revisión manual de un documento en la bandeja. */
export class RevisarDocumentoDto {
  @IsInt()
  ide_bddoc: number;

  @IsIn(['APROBADO', 'RECHAZADO'])
  estado: 'APROBADO' | 'RECHAZADO';

  /** Corrige el tipo si la clasificación automática se equivocó. */
  @IsIn([...TIPOS_DOCUMENTO_BDT])
  @IsOptional()
  tipo?: (typeof TIPOS_DOCUMENTO_BDT)[number];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CorreccionValorDto)
  valores?: CorreccionValorDto[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  observacion?: string;
}
