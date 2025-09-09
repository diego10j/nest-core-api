import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class PerfilSistemaDto extends QueryOptionsDto {
  @IsInt()
  ide_sist: number;

  @IsInt()
  ide_perf: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  opciones?: string[];
}
