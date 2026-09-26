import { IsIn, IsOptional, Matches } from 'class-validator';

export class GetUsoQuimiaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaDesde: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaHasta: string;

  @IsOptional()
  @IsIn(['ASESOR', 'TELEGRAM'])
  canal?: 'ASESOR' | 'TELEGRAM';
}
