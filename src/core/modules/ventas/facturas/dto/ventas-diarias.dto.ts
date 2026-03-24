import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasDiariasDto extends QueryOptionsDto {
  @IsDateString()
  @IsOptional()
  fecha?: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  dias?: number = 15; // 15 dias analizar

  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  @IsOptional()
  ide_sucu?: number[];
}
