import { IsIn, IsOptional, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Filtros del listado de archivos cargados (página Archivos cargados). Listas separadas por coma. */
export class GetArchivosCargadosDto extends QueryOptionsDto {
  /** FICHA_TECNICA,CERTIFICADO_ANALISIS,HOJA_SEGURIDAD,OTRO,SIN_CLASIFICAR */
  @IsOptional()
  @Matches(/^[A-Z_,]*$/)
  tipos?: string;

  /** PDF,IMAGEN,VIDEO,OFFICE,COMPRIMIDO,OTRO */
  @IsOptional()
  @Matches(/^[A-Z_,]*$/)
  formatos?: string;

  /** ide_incate separados por coma */
  @IsOptional()
  @Matches(/^[0-9,]*$/)
  categorias?: string;

  /** Fecha de carga del archivo (yyyy-MM-dd) */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaDesde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaHasta?: string;

  /** EXTRAIDO = ya está en la base técnica; SIN_EXTRAER = PDF/imagen que aún no se procesa */
  @IsOptional()
  @IsIn(['EXTRAIDO', 'SIN_EXTRAER'])
  extraccion?: 'EXTRAIDO' | 'SIN_EXTRAER';

  /**
   * DUPLICADOS = producto con más de un archivo del mismo tipo (ficha/COA/hoja); ANTIGUOS = todos menos el
   * más reciente de cada grupo (candidatos a eliminar); COMPARTIDOS = mismo archivo en varios productos.
   */
  @IsOptional()
  @IsIn(['DUPLICADOS', 'ANTIGUOS', 'COMPARTIDOS'])
  vista?: 'DUPLICADOS' | 'ANTIGUOS' | 'COMPARTIDOS';

  /** Por defecto solo productos activos. */
  @IsOptional()
  @IsIn(['true', 'false'])
  incluirInactivos?: 'true' | 'false';
}
