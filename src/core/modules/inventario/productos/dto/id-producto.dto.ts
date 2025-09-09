import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdProductoDto extends QueryOptionsDto {
  @IsInt()
  ide_inarti: number;
}
