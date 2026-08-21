import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class GetArticulosDto {
  @IsString()
  @IsOptional()
  query?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  ideCcat?: number;

  @IsString()
  @IsOptional()
  tag?: string;

  @IsIn(['PRODUCTO', 'PERSONA'])
  @IsOptional()
  tipoRelacion?: 'PRODUCTO' | 'PERSONA';

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  ideReferencia?: number;

  @IsIn(['true', 'false'])
  @IsOptional()
  favorito?: 'true' | 'false';
}
