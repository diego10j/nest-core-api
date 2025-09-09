import { IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ProformasMensualesDto extends QueryOptionsDto {
  @IsInt()
  periodo: number;

  @IsInt()
  @IsOptional()
  ide_usua?: number;
}
