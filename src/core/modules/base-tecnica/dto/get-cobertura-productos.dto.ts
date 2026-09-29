import { IsIn, IsOptional, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Filtros de la cobertura documental por producto (página Archivos cargados). */
export class GetCoberturaProductosDto extends QueryOptionsDto {
  /**
   * SIN_ARCHIVOS = ningún adjunto; SIN_FICHA / SIN_COA / SIN_SDS = falta ese tipo; INCOMPLETO = falta alguno de
   * los tres; COMPLETO = tiene los tres; DUPLICADOS = más de un archivo de algún tipo.
   */
  @IsOptional()
  @IsIn(['SIN_ARCHIVOS', 'SIN_FICHA', 'SIN_COA', 'SIN_SDS', 'INCOMPLETO', 'COMPLETO', 'DUPLICADOS'])
  cobertura?: 'SIN_ARCHIVOS' | 'SIN_FICHA' | 'SIN_COA' | 'SIN_SDS' | 'INCOMPLETO' | 'COMPLETO' | 'DUPLICADOS';

  /** ide_incate separados por coma */
  @IsOptional()
  @Matches(/^[0-9,]*$/)
  categorias?: string;

  /** Por defecto solo productos activos. */
  @IsOptional()
  @IsIn(['true', 'false'])
  incluirInactivos?: 'true' | 'false';
}
