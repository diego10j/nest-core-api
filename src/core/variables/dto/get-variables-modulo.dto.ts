import { IsInt, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetVariablesModuloDto extends QueryOptionsDto {
  @IsInt()
  @IsNotEmpty()
  ideModu: number;
}
