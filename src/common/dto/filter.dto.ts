import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

// Debe coincidir con DataSourceService.ALLOWED_FILTER_OPERATORS (datasource.service.ts) -
// el operador se interpola directo en el SQL (no se puede parametrizar), por eso ambos lados
// validan contra la misma whitelist.
export const FILTER_OPERATORS = [
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'ILIKE',
  'NOT ILIKE',
  'STARTS_WITH',
  'ENDS_WITH',
  'IN',
  'NOT IN',
  'BETWEEN',
] as const;

export class FilterDto {
  @ApiProperty({ description: 'Nombre de columna', example: 'nombre' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/, { message: 'column debe ser un identificador de columna válido' })
  column: string;

  @ApiPropertyOptional({ description: 'Operador de comparación', example: 'ILIKE', default: 'ILIKE', enum: FILTER_OPERATORS })
  @IsIn(FILTER_OPERATORS)
  @IsOptional()
  operator?: (typeof FILTER_OPERATORS)[number] = 'ILIKE';

  @ApiProperty({ description: 'Valor a comparar (array para IN/NOT IN/BETWEEN)', example: 'Diego' })
  @IsNotEmpty()
  value: any;
}
