import { IsDateString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ProformasDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;
}
