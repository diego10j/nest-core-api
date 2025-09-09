import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetDetalleCampaniaDto extends QueryOptionsDto {
  @IsInt()
  ide_whcenv: number;
}
