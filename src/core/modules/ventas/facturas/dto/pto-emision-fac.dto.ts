import { IsBoolean, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class PuntosEmisionFacturasDto extends QueryOptionsDto {
  @IsBoolean()
  @IsOptional()
  filterSucu?: boolean = true;
}
