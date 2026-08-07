import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class OrderByDto {
  @ApiProperty({ description: 'Columna para ordenar', example: 'nombre' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/, { message: 'column debe ser un identificador de columna válido' })
  column: string;

  @ApiPropertyOptional({ description: 'Dirección de ordenamiento', example: 'ASC', default: 'ASC' })
  @IsIn(['ASC', 'DESC'])
  @IsOptional()
  @IsString()
  direction?: 'ASC' | 'DESC' = 'ASC';
}
