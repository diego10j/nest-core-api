import { IsIn, IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetMisNotificacionesDto extends QueryOptionsDto {
  @IsString()
  @IsIn(['all', 'unread', 'archived'])
  @IsOptional()
  tab?: string = 'all';
}
