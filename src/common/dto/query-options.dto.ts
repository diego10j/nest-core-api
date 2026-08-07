import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

import { FilterDto } from './filter.dto';
import { GlobalFilterDto } from './global-filter.dto';
import { OrderByDto } from './order-by.dto';
import { PaginationDto } from './pagination.dto';

export class QueryOptionsDto {
  @IsIn(['true', 'false']) // Solo permite estos valores
  @IsOptional()
  lazy?: 'true' | 'false' = 'true';

  // Cuando el frontend ya cargó las columnas (primera carga), envía 'false' en los refetch
  // (paginar/ordenar/filtrar) para que el backend no recalcule ni reenvíe el esquema.
  @IsIn(['true', 'false'])
  @IsOptional()
  schema?: 'true' | 'false' = 'true';

  @IsOptional()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PaginationDto)
  pagination?: PaginationDto;

  @IsOptional()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GlobalFilterDto)
  globalFilter?: GlobalFilterDto;

  @IsOptional()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderByDto)
  orderBy?: OrderByDto;

  @IsOptional()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FilterDto)
  filters?: FilterDto[];

  // Cortocircuita createQuery para retornar valores únicos de esta columna (filtro por
  // columna estilo Excel en tablas lazy) en vez de datos paginados. Ver DataSourceService.createQuery.
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/, { message: 'distinctColumn debe ser un identificador de columna válido' })
  distinctColumn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  distinctSearch?: string;
}
