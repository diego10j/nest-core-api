import { IsDateString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ReporteSeguidoresDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}
