import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CabComprobanteInventarioDto extends QueryOptionsDto {
  @IsInt()
  ide_incci: number;
}
