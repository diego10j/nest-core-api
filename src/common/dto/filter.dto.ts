import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FilterDto {
  @ApiProperty({ description: 'Nombre de columna', example: 'nombre' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'column no debe contener espacios' })
  column: string;

  @ApiPropertyOptional({ description: 'Operador de comparación', example: 'ILIKE', default: 'ILIKE' })
  @IsString()
  @IsOptional()
  operator?: string = 'ILIKE';

  @ApiProperty({ description: 'Valor a comparar', example: 'Diego' })
  @IsNotEmpty()
  value: any;
}
