import { IsIn, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetConfigPrecioProductoDto extends QueryOptionsDto {
  @IsInt()
  ide_inarti: number;

  @IsIn(['true']) // Solo permite estr valor
  @IsOptional()
  activos?: 'true';
}
