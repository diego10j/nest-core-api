import { IsIn, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetProductoDto extends QueryOptionsDto {
  @IsIn(['true'])
  @IsOptional()
  activos?: 'true';

  @IsInt()
  @IsOptional()
  ide_incate?: number;
}
