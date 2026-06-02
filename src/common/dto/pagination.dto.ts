import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, Min } from 'class-validator';

export class PaginationDto {
  @ApiProperty({ description: 'Número de registros por página', example: 20 })
  @IsPositive()
  @Type(() => Number)
  @Min(1)
  pageSize: number;

  @ApiPropertyOptional({ description: 'Índice de página (0-indexed)', example: 0, default: 0 })
  @IsInt()
  @Min(0)
  pageIndex: number = 0;

  @ApiPropertyOptional({ description: 'Obtener última página', example: 'false', default: 'false' })
  @IsIn(['true', 'false'])
  @IsOptional()
  lastPage?: 'true' | 'false' = 'false';
}
