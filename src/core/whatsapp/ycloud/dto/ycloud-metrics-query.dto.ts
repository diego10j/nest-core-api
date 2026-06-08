import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class YcloudMetricsQueryDto extends QueryOptionsDto {
  @IsDateString()
  @IsOptional()
  fechaDesde?: string;

  @IsDateString()
  @IsOptional()
  fechaHasta?: string;

  @IsInt()
  @IsOptional()
  agenteId?: number;
}
