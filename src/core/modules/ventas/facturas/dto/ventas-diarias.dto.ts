import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasDiariasDto extends QueryOptionsDto {
  @IsDateString()
  @IsOptional()
  fecha?: string;

  @IsInt()
  @IsPositive()
  dias: number = 15; // 15 dias analizar
}
