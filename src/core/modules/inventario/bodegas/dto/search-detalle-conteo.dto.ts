import { IsInt, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class SearchDetalleConteoDto extends QueryOptionsDto {
  @IsInt()
  ide_inccf: number;

  @IsString()
  value: string;

  @IsInt()
  limit?: number = 25;
}
