import { IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetCatalogoProductosDto extends QueryOptionsDto {
  @IsOptional()
  @IsString()
  tag?: string;
}
