import { IsDateString, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class VentasDiariasDto extends QueryOptionsDto {
  @IsDateString()
  @IsOptional()
  fecha?: string;
}
