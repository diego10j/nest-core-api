import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Filtros del listado general (página Base Técnica). Listas separadas por coma (query string). */
export class GetDocumentosTecnicosDto extends QueryOptionsDto {
  /** APROBADO,REVISION,RECHAZADO,ERROR */
  @IsOptional()
  @Matches(/^[A-Z_,]*$/)
  estados?: string;

  /** FICHA_TECNICA,CERTIFICADO_ANALISIS,HOJA_SEGURIDAD,OTRO */
  @IsOptional()
  @Matches(/^[A-Z_,]*$/)
  tipos?: string;

  @IsOptional()
  @IsIn(['TEXTO', 'VISION'])
  metodo?: 'TEXTO' | 'VISION';

  /** BAJA (< 90%), MEDIA (90-95%), ALTA (> 95%) */
  @IsOptional()
  @Matches(/^(BAJA|MEDIA|ALTA)(,(BAJA|MEDIA|ALTA))*$/)
  confianzas?: string;

  /** ide_incate separados por coma */
  @IsOptional()
  @Matches(/^[0-9,]*$/)
  categorias?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaDesde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaHasta?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  soloVigentes?: 'true' | 'false';

  /** true = solo reutilizados de otro producto; mejorados = leídos con el modelo avanzado */
  @IsOptional()
  @IsIn(['REUTILIZADOS', 'MEJORADOS'])
  origen?: 'REUTILIZADOS' | 'MEJORADOS';

  @IsOptional()
  @IsString()
  producto?: string;
}
