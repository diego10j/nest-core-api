import { IsInt, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class SearchDto extends QueryOptionsDto {
  @ApiProperty({ description: 'Texto de búsqueda', example: 'Diego' })
  @IsString()
  value: string;

  @ApiPropertyOptional({ description: 'Límite de resultados', example: 25, default: 25 })
  @IsInt()
  limit?: number = 25;
}
