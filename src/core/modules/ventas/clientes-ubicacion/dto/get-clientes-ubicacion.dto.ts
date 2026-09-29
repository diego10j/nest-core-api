import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Filtros de la página Clientes por ubicación (aplican al dashboard y a las tablas). */
export class GetClientesUbicacionDto extends QueryOptionsDto {
  /** Período de ventas y envíos: últimos N meses (3, 6, 12 o 24). Por defecto 12. */
  @IsOptional()
  @Type(() => Number)
  @IsIn([3, 6, 12, 24])
  meses?: number;

  /** Solo clientes de esta provincia (gen_provincia.ide_geprov). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ide_geprov?: number;

  /** Solo clientes de este cantón (gen_canton.ide_gecant). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ide_gecant?: number;

  /** true = solo clientes sin provincia (datos por completar). */
  @IsOptional()
  @IsIn(['true', 'false'])
  sinProvincia?: 'true' | 'false';

  /** con = solo clientes con coordenadas GPS válidas; sin = solo los que no tienen. */
  @IsOptional()
  @IsIn(['con', 'sin'])
  geo?: 'con' | 'sin';

  /** Solo direcciones con este resultado de validación del GPS (tabla de direcciones). */
  @IsOptional()
  @IsIn(['OK', 'SIN', 'INVALIDA', 'FUERA', 'INVERTIDA'])
  estadoGeo?: 'OK' | 'SIN' | 'INVALIDA' | 'FUERA' | 'INVERTIDA';

  /** true = solo clientes que compraron en el período; false = solo los que no. */
  @IsOptional()
  @IsIn(['true', 'false'])
  compraron?: 'true' | 'false';
}
