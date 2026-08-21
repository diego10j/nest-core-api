import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class RelacionItem {
  @IsIn(['PRODUCTO', 'PERSONA'])
  @IsNotEmpty()
  tipoRelacion: 'PRODUCTO' | 'PERSONA';

  @IsInt()
  @IsNotEmpty()
  ideReferencia: number;

  @IsString()
  @IsNotEmpty()
  nombreReferencia: string;

  @IsString()
  @IsOptional()
  subtipoReferencia?: string;
}

export class SaveArticuloDto {
  @IsUUID()
  @IsOptional()
  uuid?: string;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsOptional()
  contenido?: string;

  @IsString()
  @IsOptional()
  categoria?: string;

  @IsBoolean()
  @IsOptional()
  favorito?: boolean;

  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ValidateNested({ each: true })
  @Type(() => RelacionItem)
  @IsOptional()
  relaciones?: RelacionItem[];
}
