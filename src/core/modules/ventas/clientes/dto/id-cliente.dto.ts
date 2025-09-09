import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdClienteDto extends QueryOptionsDto {
  @IsInt()
  ide_geper: number;
}
