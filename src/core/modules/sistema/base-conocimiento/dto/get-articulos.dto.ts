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

  @IsIn(['PRODUCTO', 'PERSONA', 'NOTA'])
  @IsOptional()
  tipoRelacion?: 'PRODUCTO' | 'PERSONA' | 'NOTA';

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  ideReferencia?: number;

  @IsIn(['true', 'false'])
  @IsOptional()
  favorito?: 'true' | 'false';

  @IsIn(['reciente', 'antiguo', 'vistas', 'alfabetico'])
  @IsOptional()
  orderBy?: 'reciente' | 'antiguo' | 'vistas' | 'alfabetico';
}
