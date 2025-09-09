import { IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ContentProductDto extends QueryOptionsDto {
  @IsString()
  readonly product: string;
}
