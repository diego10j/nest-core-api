import { IsInt, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetEtiquetasCategoriaDto extends QueryOptionsDto {
  @IsInt()
  @IsNotEmpty()
  ide_incate: number;
}
