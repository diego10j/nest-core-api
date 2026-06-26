import { IsBoolean, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetPlantillasDto extends QueryOptionsDto {
  @IsBoolean()
  @IsOptional()
  activoNoti?: boolean;
}
