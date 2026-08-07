import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsArray, Matches } from 'class-validator';

export class GlobalFilterDto {
  @ApiProperty({ description: 'Valor de búsqueda global', example: 'Diego' })
  @IsString()
  value: string;

  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((col) => col.trim())
        .filter((col) => col.length > 0);
    }
    return [];
  })
  @ApiProperty({ description: 'Columnas donde buscar', example: ['nombre', 'email'] })
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/, { each: true, message: 'columns debe contener identificadores de columna válidos' })
  columns: string[];
}
