import { IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class BotSessionQueryDto extends QueryOptionsDto {
  @IsString()
  @IsOptional()
  estado?: string;
}
