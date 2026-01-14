import { IsDateString, IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetCostoProductoDto extends QueryOptionsDto {
  @IsDateString()
  fecha: string;

  @IsInt()
  ide_inarti: number;
}
