import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class GetConversacionesQuimiaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaDesde: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaHasta: string;

  @IsOptional()
  @IsIn(['ASESOR', 'TELEGRAM'])
  canal?: 'ASESOR' | 'TELEGRAM';

  /** Usuario del ERP (usuario_ingre), solo canal ASESOR. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  usuario?: string;

  /** Teléfono de Telegram (telefono_bdcon), solo canal TELEGRAM. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;
}
