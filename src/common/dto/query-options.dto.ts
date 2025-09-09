import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';

import { FilterDto } from './filter.dto';
import { GlobalFilterDto } from './global-filter.dto';
import { OrderByDto } from './order-by.dto';
import { PaginationDto } from './pagination.dto';

export class QueryOptionsDto {
  @IsIn(['true', 'false']) // Solo permite estos valores
  @IsOptional()
  lazy?: 'true' | 'false' = 'true';

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
}
