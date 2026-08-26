import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TransportesDiariaDto extends QueryOptionsDto {
  @IsDateString()
  @IsOptional()
  fecha?: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  dias?: number = 15;
}
