import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, Max } from 'class-validator';

export class PaginasMasUsadasDto {
  @IsInt()
  @IsPositive()
  @Max(20)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 6;
}
