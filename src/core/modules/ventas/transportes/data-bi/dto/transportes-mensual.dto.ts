import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TransportesMensualDto extends QueryOptionsDto {
  @IsInt()
  @IsPositive()
  periodo: number;
}
