import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class HorarioDto extends QueryOptionsDto {
  @IsInt()
  ide_tihor: number;
}
